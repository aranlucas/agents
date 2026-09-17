package agui

import (
	"context"
	json "encoding/json/v2"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"

	"agents/internal/agentruntime"
	"agents/internal/auth"
	"agents/internal/common"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/types"
	"google.golang.org/adk/v2/session"
)

const maximumStateRequestBytes = 64 << 10

// stateRequest is the experimental POST /<agent>/agents/state request body,
// mirroring ag_ui_adk's AgentStateRequest (see
// ag_ui_adk/endpoint.py::AgentStateRequest). appName/userId are
// intentionally not accepted: this gateway always derives identity from the
// verified Clerk subject (or the public anonymous-per-thread identity),
// never from client-supplied body fields.
type stateRequest struct {
	ThreadID string `json:"threadId"`
}

// stateResponse mirrors ag_ui_adk's AgentStateResponse shape so existing
// AG-UI frontend clients need no changes. Messages carries the thread's
// history reconstructed from persisted ADK session events (see
// eventsToMessages in messages.go); State carries only non-temporary state.
type stateResponse struct {
	ThreadID     string            `json:"threadId"`
	ThreadExists bool              `json:"threadExists"`
	State        stateDocument     `json:"state"`
	Messages     []types.Message   `json:"messages"`
	Interrupts   []types.Interrupt `json:"-"`
}

func loadThreadState(ctx context.Context, sessions session.Service, entry agentruntime.Entry, identity auth.Identity, threadID string) (stateResponse, error) {
	response := stateResponse{ThreadID: threadID, State: stateDocument{}, Messages: []types.Message{}}
	userID := effectiveUserID(identity, threadID)
	found, err := sessions.Get(ctx, &session.GetRequest{AppName: entry.AppName, UserID: userID, SessionID: threadID})
	switch {
	case err == nil:
		response.ThreadExists = true
		response.State, err = persistentSnapshot(found.Session.State())
		if err != nil {
			return stateResponse{}, err
		}
		response.Messages, err = eventsToMessages(found.Session.Events())
		if err != nil {
			return stateResponse{}, err
		}
		response.Interrupts = unresolvedSessionInterrupts(found.Session.Events())
		return response, nil
	case errors.Is(err, session.ErrNotFound):
		return response, nil
	default:
		return stateResponse{}, err
	}
}

// StateHandler implements the experimental POST /<agent>/agents/state
// endpoint: on-demand retrieval of a thread's persisted, non-temporary state
// and message history without starting a new agent run.
//
// A session that genuinely does not exist yet (session.ErrNotFound)
// is reported as threadExists: false with a 200 — that is an expected,
// unremarkable outcome for a thread the client hasn't started. Any other
// sessions.Get failure (a D1 outage, a decode error, ...) is a real backend
// problem: it is logged server-side and reported as a 500 with a sanitized
// error code, mirroring ag_ui_adk's endpoint, which returns a 500 with an
// error field on unexpected exceptions instead of silently downgrading them
// to "thread not found".
func StateHandler(registry *agentruntime.Registry, sessions session.Service) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		payload, err := io.ReadAll(io.LimitReader(r.Body, maximumStateRequestBytes+1))
		if err != nil || len(payload) > maximumStateRequestBytes {
			writeJSONError(w, http.StatusBadRequest, "invalid_state_request")
			return
		}
		var input stateRequest
		if json.Unmarshal(payload, &input) != nil || strings.TrimSpace(input.ThreadID) == "" {
			writeJSONError(w, http.StatusBadRequest, "invalid_state_request")
			return
		}

		entry, err := registry.Lookup(routeAgent(r.URL.Path))
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "unknown_agent")
			return
		}

		identity, ok := auth.FromContext(r.Context())
		if !ok {
			identity = auth.Identity{UserID: "anonymous", Public: true}
		}
		ctx, cancel := context.WithTimeout(r.Context(), entry.Timeout)
		defer cancel()

		response, err := loadThreadState(ctx, sessions, entry, identity, input.ThreadID)
		if err != nil {
			log.Printf("state route: session lookup failed for app=%s thread=%s: %v", entry.AppName, input.ThreadID, err)
			writeJSONError(w, http.StatusInternalServerError, "state_unavailable")
			return
		}

		if err := common.WriteJSON(w, http.StatusOK, response); err != nil {
			log.Printf("write JSON response: %v", err)
		}
	})
}
