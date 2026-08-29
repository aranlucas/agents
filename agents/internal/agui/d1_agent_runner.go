package agui

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"agents/internal/agentruntime"
	"agents/internal/auth"
	"agents/internal/common"
	"agents/internal/observability"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	"google.golang.org/adk/v2/session"
)

// D1AgentRunner is the gateway's concrete CopilotKit runner. ADK's D1-backed
// session service owns durable state and event history; activeRuns adds a
// low-latency local path while the optional ActiveRunStore implemented by the
// D1 session service coordinates ownership, replay, and stop across replicas.
// Unlike IntelligenceAgentRunner, it does not require a managed control plane
// or realtime metadata subscription.
type D1AgentRunner struct {
	sessions session.Service
	active   *activeRuns
	store    ActiveRunStore
}

func NewD1AgentRunner(sessions session.Service) (*D1AgentRunner, error) {
	if sessions == nil {
		return nil, errors.New("session service is required")
	}
	store, _ := sessions.(ActiveRunStore)
	return &D1AgentRunner{sessions: sessions, active: newActiveRuns(store), store: store}, nil
}

func (r *D1AgentRunner) newRunHandler(entry agentruntime.Entry, opts ...Option) (http.Handler, error) {
	runOptions := append([]Option(nil), opts...)
	runOptions = append(runOptions, withActiveRuns(r.active))
	return NewEntryHandler(entry, r.sessions, runOptions...)
}

func (r *D1AgentRunner) connectHandler(agent copilotKitAgent) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		input, err := decodeRunInput(request.Body)
		if err != nil {
			writeJSONErrorMessage(w, http.StatusBadRequest, "Invalid request body", err.Error())
			return
		}
		identity, ok := auth.FromContext(request.Context())
		if !ok {
			identity = auth.Identity{UserID: "anonymous", Public: true}
		}
		key := runKey{
			AppName:    agent.entry.AppName,
			AgentRoute: agent.entry.Route,
			UserID:     effectiveUserID(identity, input.ThreadID),
			ThreadID:   input.ThreadID,
		}

		local := r.active.lookup(key)
		var durableKey ActiveRunKey
		var stored *ActiveRunSnapshot
		if local == nil && r.store != nil {
			durableKey = ActiveRunKey{AppName: key.AppName, UserID: key.UserID, ThreadID: key.ThreadID}
			stored, err = r.store.CurrentActiveRun(request.Context(), durableKey)
			if err != nil && !errors.Is(err, ErrActiveRunNotFound) {
				log.Printf("CopilotKit connect: active-run lookup failed for agent=%s thread=%s: %v", agent.id, input.ThreadID, err)
				writeJSONError(w, http.StatusInternalServerError, "state_unavailable")
				return
			}
			if errors.Is(err, ErrActiveRunNotFound) {
				stored = nil
			}
		}

		var state stateResponse
		ctx := request.Context()
		if local == nil && stored == nil {
			var cancel context.CancelFunc
			ctx, cancel = context.WithTimeout(request.Context(), agent.entry.Timeout)
			defer cancel()
			state, err = loadThreadState(ctx, r.sessions, agent.entry, identity, input.ThreadID)
			if err != nil {
				log.Printf("CopilotKit connect: session lookup failed for agent=%s thread=%s: %v", agent.id, input.ThreadID, err)
				writeJSONError(w, http.StatusInternalServerError, "state_unavailable")
				return
			}
		}

		writeSSEHeaders(w)
		w.WriteHeader(http.StatusOK)
		emitter := newReplayAwareEmitter(w, nil)
		emitFailure := func(streamErr error) {
			var transportErr *eventTransportError
			if errors.As(streamErr, &transportErr) {
				return
			}
			terminalCtx := context.WithoutCancel(request.Context())
			log.Printf("CopilotKit connect failed: agent=%s thread=%s: %v", agent.id, input.ThreadID, streamErr)
			observability.CaptureError(terminalCtx, streamErr, observability.ErrorDetails{
				Operation: "agent.connect",
				Tags:      map[string]string{"agent.app_name": agent.entry.AppName, "agent.route": agent.entry.Route},
				Context:   map[string]any{"run_id": input.RunID, "thread_id": input.ThreadID},
			})
			if err := emitter.Emit(terminalCtx, sanitizeRunError(input.RunID, streamErr)); err != nil && !errors.Is(err, errEventAfterTerminal) {
				log.Printf("CopilotKit connect: terminal emission failed for agent=%s thread=%s: %v", agent.id, input.ThreadID, err)
			}
		}
		defer func() {
			recovered := recover()
			if recovered == nil {
				return
			}
			panicErr := fmt.Errorf("AG-UI connect panic: %v", recovered)
			terminalCtx := context.WithoutCancel(request.Context())
			log.Printf("CopilotKit connect panicked: agent=%s thread=%s", agent.id, input.ThreadID)
			observability.CaptureError(terminalCtx, panicErr, observability.ErrorDetails{
				Operation: "agent.connect",
				Tags:      map[string]string{"agent.app_name": agent.entry.AppName, "agent.route": agent.entry.Route},
				Context:   map[string]any{"run_id": input.RunID, "thread_id": input.ThreadID},
			})
			if err := emitter.Emit(terminalCtx, sanitizeRunError(input.RunID, panicErr)); err != nil && !errors.Is(err, errEventAfterTerminal) {
				log.Printf("CopilotKit connect: panic terminal emission failed for agent=%s thread=%s: %v", agent.id, input.ThreadID, err)
			}
		}()
		if local != nil {
			if err := local.replay(request.Context(), func(encoded []byte) error {
				return emitter.emitEncoded(request.Context(), encoded)
			}); err != nil && request.Context().Err() == nil {
				emitFailure(err)
			}
			return
		}
		if stored != nil {
			if err := r.replayDurableRun(request.Context(), durableKey, stored, emitter); err != nil && request.Context().Err() == nil {
				emitFailure(err)
			}
			return
		}

		if err := emitter.Emit(ctx, events.NewRunStartedEvent(input.ThreadID, input.RunID)); err != nil {
			emitFailure(err)
			return
		}
		if err := emitter.Emit(ctx, events.NewMessagesSnapshotEvent(state.Messages)); err != nil {
			emitFailure(err)
			return
		}
		if err := emitter.Emit(ctx, events.NewStateSnapshotEvent(state.State)); err != nil {
			emitFailure(err)
			return
		}
		finishedOutcome := events.WithSuccessOutcome()
		if len(state.Interrupts) > 0 {
			finishedOutcome = events.WithInterruptOutcome(state.Interrupts)
		}
		if err := emitter.Emit(ctx, events.NewRunFinishedEventWithOptions(input.ThreadID, input.RunID, finishedOutcome)); err != nil {
			emitFailure(err)
		}
	})
}

func (r *D1AgentRunner) replayDurableRun(ctx context.Context, key ActiveRunKey, snapshot *ActiveRunSnapshot, emitter *replayAwareEmitter) error {
	if snapshot == nil || snapshot.RunID == "" {
		return ErrActiveRunNotFound
	}
	cursor := int64(0)
	for {
		for _, encoded := range snapshot.Events {
			if err := emitter.emitEncoded(ctx, encoded); err != nil {
				return err
			}
			cursor++
		}
		if snapshot.Finished {
			if emitter.terminal {
				return nil
			}
			return emitter.Emit(context.WithoutCancel(ctx), sanitizeRunError(snapshot.RunID, errors.New("durable AG-UI run finished without a terminal event")))
		}
		timer := time.NewTimer(250 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
		loaded, err := r.store.LoadActiveRun(ctx, key, snapshot.RunID, cursor)
		if err != nil {
			return err
		}
		snapshot = loaded
	}
}

func (r *D1AgentRunner) stopHandler(agent copilotKitAgent) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		threadID := strings.TrimSpace(request.PathValue("threadId"))
		if threadID == "" {
			writeJSONErrorMessage(w, http.StatusBadRequest, "Invalid request", "threadId is required")
			return
		}
		identity, ok := auth.FromContext(request.Context())
		if !ok {
			identity = auth.Identity{UserID: "anonymous", Public: true}
		}
		stopped, stopErr := r.active.requestStop(request.Context(), runKey{
			AppName:    agent.entry.AppName,
			AgentRoute: agent.entry.Route,
			UserID:     effectiveUserID(identity, threadID),
			ThreadID:   threadID,
		})
		if stopErr != nil {
			log.Printf("CopilotKit stop: D1 request failed for agent=%s thread=%s: %v", agent.id, threadID, stopErr)
			writeJSONError(w, http.StatusInternalServerError, "state_unavailable")
			return
		}

		if !stopped {
			if err := common.WriteJSON(w, http.StatusOK, map[string]any{
				"stopped": false,
				"message": fmt.Sprintf("No active run for thread '%s'.", threadID),
			}); err != nil {
				log.Printf("write JSON response: %v", err)
			}
			return
		}
		if err := common.WriteJSON(w, http.StatusOK, map[string]any{
			"stopped": true,
			"interrupt": map[string]string{
				"type": "RUN_ERROR", "message": "Run stopped by user", "code": "STOPPED",
			},
		}); err != nil {
			log.Printf("write JSON response: %v", err)
		}
	})
}

func writeSSEHeaders(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
}
