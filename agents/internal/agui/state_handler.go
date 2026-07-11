package agui

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"

	"agents/internal/agentruntime"
	"agents/internal/auth"
	"agents/internal/cloudflare"
	aguitypes "github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/types"
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
	ThreadID     string              `json:"threadId"`
	ThreadExists bool                `json:"threadExists"`
	State        map[string]any      `json:"state"`
	Messages     []aguitypes.Message `json:"messages"`
}

// StateHandler implements the experimental POST /<agent>/agents/state
// endpoint: on-demand retrieval of a thread's persisted, non-temporary state
// and message history without starting a new agent run.
//
// A session that genuinely does not exist yet (cloudflare.ErrSessionNotFound)
// is reported as threadExists: false with a 200 — that is an expected,
// unremarkable outcome for a thread the client hasn't started. Any other
// sessions.Get failure (a D1 outage, a decode error, ...) is a real backend
// problem: it is logged server-side and reported as a 500 with a sanitized
// error code, mirroring ag_ui_adk's endpoint, which returns a 500 with an
// error field on unexpected exceptions instead of silently downgrading them
// to "thread not found".
func StateHandler(registry *agentruntime.Registry, sessions session.Service) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var input stateRequest
		if err := json.NewDecoder(io.LimitReader(r.Body, maximumStateRequestBytes)).Decode(&input); err != nil || strings.TrimSpace(input.ThreadID) == "" {
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
		userID := effectiveUserID(identity, input.ThreadID)

		ctx, cancel := context.WithTimeout(r.Context(), entry.Timeout)
		defer cancel()

		response := stateResponse{ThreadID: input.ThreadID, State: map[string]any{}, Messages: []aguitypes.Message{}}
		found, err := sessions.Get(ctx, &session.GetRequest{AppName: entry.AppName, UserID: userID, SessionID: input.ThreadID})
		switch {
		case err == nil:
			response.ThreadExists = true
			response.State = persistentSnapshot(found.Session.State())
			response.Messages = eventsToMessages(found.Session.Events())
		case errors.Is(err, cloudflare.ErrSessionNotFound):
			// Expected: no session has been created for this thread yet.
		default:
			log.Printf("state route: session lookup failed for app=%s thread=%s: %v", entry.AppName, input.ThreadID, err)
			writeJSONError(w, http.StatusInternalServerError, "state_unavailable")
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(response)
	})
}
