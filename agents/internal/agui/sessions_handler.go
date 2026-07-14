package agui

import (
	"cmp"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"slices"
	"strings"

	"agents/internal/agentruntime"
	"agents/internal/auth"
	"google.golang.org/adk/v2/session"
)

// sessionSummary is the sidebar-facing subset of ADK's REST session model.
// The app and user are already fixed by the route and verified JWT, while
// state and events are loaded only when the selected thread is opened.
type sessionSummary struct {
	ID             string `json:"id"`
	Name           string `json:"name,omitempty"`
	LastUpdateTime int64  `json:"lastUpdateTime"`
}

const sessionNameStateKey = "session_name"

// SessionsHandler lists every live ADK session for the authenticated user and
// route's agent. Unlike ADK's development REST API, app_name and user_id are
// never accepted from the client: the registry supplies the app and Clerk's
// verified JWT subject supplies the user.
func SessionsHandler(registry *agentruntime.Registry, sessions session.Service) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		entry, err := registry.Lookup(routeAgent(r.URL.Path))
		if err != nil {
			writeJSONError(w, http.StatusNotFound, "unknown_agent")
			return
		}

		identity, ok := auth.FromContext(r.Context())
		if !ok || identity.Public || strings.TrimSpace(identity.UserID) == "" {
			writeJSONError(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), entry.Timeout)
		defer cancel()
		listed, err := sessions.List(ctx, &session.ListRequest{AppName: entry.AppName, UserID: identity.UserID})
		if err != nil {
			log.Printf("sessions route: list failed for app=%s user=%s: %v", entry.AppName, identity.UserID, err)
			writeJSONError(w, http.StatusInternalServerError, "sessions_unavailable")
			return
		}

		result := make([]sessionSummary, 0, len(listed.Sessions))
		for _, stored := range listed.Sessions {
			if stored == nil || strings.TrimSpace(stored.ID()) == "" {
				continue
			}
			name, _ := stored.State().Get(sessionNameStateKey)
			storedName, _ := name.(string)
			result = append(result, sessionSummary{
				ID:             stored.ID(),
				Name:           strings.TrimSpace(storedName),
				LastUpdateTime: stored.LastUpdateTime().Unix(),
			})
		}
		slices.SortFunc(result, func(a, b sessionSummary) int {
			if a.LastUpdateTime != b.LastUpdateTime {
				return cmp.Compare(b.LastUpdateTime, a.LastUpdateTime)
			}
			return strings.Compare(a.ID, b.ID)
		})

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(result)
	})
}
