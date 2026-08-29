package agui

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"agents/internal/agentruntime"
	"agents/internal/auth"
	"agents/internal/common"
	"agents/internal/observability"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	"google.golang.org/adk/v2/session"
)

// D1AgentRunner is the gateway's concrete CopilotKit runner. ADK's D1-backed
// session service owns durable state and event history; activeRuns owns only
// process-local execution locking, live replay, and cancellation. Unlike
// IntelligenceAgentRunner, it does not claim cross-instance coordination or
// realtime metadata subscriptions.
type D1AgentRunner struct {
	sessions session.Service
	active   *activeRuns
}

func NewD1AgentRunner(sessions session.Service) (*D1AgentRunner, error) {
	if sessions == nil {
		return nil, errors.New("session service is required")
	}
	return &D1AgentRunner{sessions: sessions, active: newActiveRuns()}, nil
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
			AgentRoute: agent.entry.Route,
			UserID:     effectiveUserID(identity, input.ThreadID),
			ThreadID:   input.ThreadID,
		}

		writeSSEHeaders(w)
		emitter := newReplayAwareEmitter(w, nil)
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
		if active := r.active.lookup(key); active != nil {
			w.WriteHeader(http.StatusOK)
			if err := active.replay(request.Context(), func(encoded []byte) error {
				return emitter.emitEncoded(request.Context(), encoded)
			}); err != nil && request.Context().Err() == nil {
				log.Printf("CopilotKit connect: active replay failed for agent=%s thread=%s: %v", agent.id, input.ThreadID, err)
			}
			return
		}

		ctx, cancel := context.WithTimeout(request.Context(), agent.entry.Timeout)
		defer cancel()
		state, err := loadThreadState(ctx, r.sessions, agent.entry, identity, input.ThreadID)
		if err != nil {
			log.Printf("CopilotKit connect: session lookup failed for agent=%s thread=%s: %v", agent.id, input.ThreadID, err)
			writeJSONError(w, http.StatusInternalServerError, "state_unavailable")
			return
		}

		w.WriteHeader(http.StatusOK)
		if err := emitter.Emit(ctx, events.NewRunStartedEvent(input.ThreadID, input.RunID)); err != nil {
			log.Printf("CopilotKit connect: RUN_STARTED emission failed for agent=%s thread=%s: %v", agent.id, input.ThreadID, err)
			return
		}
		if err := emitter.Emit(ctx, events.NewMessagesSnapshotEvent(state.Messages)); err != nil {
			log.Printf("CopilotKit connect: messages snapshot emission failed for agent=%s thread=%s: %v", agent.id, input.ThreadID, err)
			return
		}
		if err := emitter.Emit(ctx, events.NewStateSnapshotEvent(state.State)); err != nil {
			log.Printf("CopilotKit connect: state snapshot emission failed for agent=%s thread=%s: %v", agent.id, input.ThreadID, err)
			return
		}
		finishedOutcome := events.WithSuccessOutcome()
		if len(state.Interrupts) > 0 {
			finishedOutcome = events.WithInterruptOutcome(state.Interrupts)
		}
		if err := emitter.Emit(ctx, events.NewRunFinishedEventWithOptions(input.ThreadID, input.RunID, finishedOutcome)); err != nil {
			log.Printf("CopilotKit connect: RUN_FINISHED emission failed for agent=%s thread=%s: %v", agent.id, input.ThreadID, err)
		}
	})
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
		stopped := r.active.stop(runKey{
			AgentRoute: agent.entry.Route,
			UserID:     effectiveUserID(identity, threadID),
			ThreadID:   threadID,
		})

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
