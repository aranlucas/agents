package agui

import (
	"context"
	json "encoding/json/v2"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"agents/internal/agentruntime"
	"agents/internal/auth"
	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/encoding/sse"
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
		frame := sse.NewSSEWriter()
		if active := r.active.lookup(key); active != nil {
			w.WriteHeader(http.StatusOK)
			if err := active.replay(request.Context(), func(event events.Event) error {
				return frame.WriteEvent(request.Context(), w, event)
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
		_ = frame.WriteEvent(ctx, w, events.NewRunStartedEvent(input.ThreadID, input.RunID))
		_ = frame.WriteEvent(ctx, w, events.NewMessagesSnapshotEvent(state.Messages))
		_ = frame.WriteEvent(ctx, w, events.NewStateSnapshotEvent(state.State))
		finishedOutcome := events.WithSuccessOutcome()
		if len(state.Interrupts) > 0 {
			finishedOutcome = events.WithInterruptOutcome(state.Interrupts)
		}
		_ = frame.WriteEvent(ctx, w, events.NewRunFinishedEventWithOptions(input.ThreadID, input.RunID, finishedOutcome))
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

		w.Header().Set("Content-Type", "application/json")
		if !stopped {
			_ = json.MarshalWrite(w, map[string]any{
				"stopped": false,
				"message": fmt.Sprintf("No active run for thread '%s'.", threadID),
			})
			return
		}
		_ = json.MarshalWrite(w, map[string]any{
			"stopped": true,
			"interrupt": map[string]string{
				"type": "RUN_ERROR", "message": "Run stopped by user", "code": "STOPPED",
			},
		})
	})
}

func writeSSEHeaders(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
}
