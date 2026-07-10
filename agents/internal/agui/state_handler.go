package agui

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
	"github.com/aranlucas/agents/agents/internal/auth"
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
// AG-UI frontend clients need no changes. Messages is always an empty array:
// reconstructing AG-UI messages from ADK session events is not yet
// implemented in the Go runtime (see converter.go for the streaming-only
// event translation that does exist), so this endpoint only advertises
// state, not history.
type stateResponse struct {
	ThreadID     string         `json:"threadId"`
	ThreadExists bool           `json:"threadExists"`
	State        map[string]any `json:"state"`
	Messages     []any          `json:"messages"`
}

// StateHandler implements the experimental POST /<agent>/agents/state
// endpoint: on-demand retrieval of a thread's persisted, non-temporary
// state without starting a new agent run. Any session lookup failure
// (including "not found") is reported as threadExists: false rather than an
// HTTP error, mirroring ag_ui_adk's endpoint, which never surfaces a 5xx for
// this experimental read path.
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

		response := stateResponse{ThreadID: input.ThreadID, State: map[string]any{}, Messages: []any{}}
		if found, err := sessions.Get(ctx, &session.GetRequest{AppName: entry.AppName, UserID: userID, SessionID: input.ThreadID}); err == nil {
			response.ThreadExists = true
			response.State = persistentSnapshot(found.Session.State())
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(response)
	})
}
