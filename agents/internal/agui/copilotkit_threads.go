package agui

import (
	"cmp"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"slices"
	"strings"
	"time"

	"agents/internal/agentruntime"
	"agents/internal/auth"
	"google.golang.org/adk/v2/session"
)

// runtimeThread mirrors the public, read-only portion of CopilotKit's v2
// ThreadRecord. D1-backed ADK sessions are the durable source of truth. The
// managed Intelligence-only fields remain deliberately unavailable.
type runtimeThread struct {
	ID             string  `json:"id"`
	OrganizationID string  `json:"organizationId"`
	AgentID        string  `json:"agentId"`
	CreatedByID    string  `json:"createdById"`
	Name           *string `json:"name"`
	Archived       bool    `json:"archived"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`
}

type runtimeThreadsResponse struct {
	Threads    []runtimeThread `json:"threads"`
	NextCursor *string         `json:"nextCursor"`
}

// listThreads ports the OSS CopilotKit runner's GET /threads contract onto the
// gateway's existing D1 ADK session service. It intentionally exposes only
// authenticated, per-user discovery; rename/archive/delete and realtime
// metadata subscriptions remain managed Intelligence capabilities.
func (r *CopilotKitRuntime) listThreads(w http.ResponseWriter, request *http.Request) {
	agentID := strings.TrimSpace(request.URL.Query().Get("agentId"))
	agent, ok := r.byID[agentID]
	if !ok {
		writeJSONErrorMessage(w, http.StatusBadRequest, "Invalid request", "Valid agentId query param is required")
		return
	}
	r.runner.listThreads(w, request, agentID, agent.entry)
}

func (r *D1AgentRunner) listThreads(w http.ResponseWriter, request *http.Request, agentID string, entry agentruntime.Entry) {
	identity, ok := auth.FromContext(request.Context())
	if !ok || identity.Public || strings.TrimSpace(identity.UserID) == "" {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	ctx, cancel := context.WithTimeout(request.Context(), entry.Timeout)
	defer cancel()
	listed, err := r.sessions.List(ctx, &session.ListRequest{
		AppName: entry.AppName,
		UserID:  identity.UserID,
	})
	if err != nil {
		log.Printf("CopilotKit threads: list failed for agent=%s user=%s: %v", agentID, identity.UserID, err)
		writeJSONError(w, http.StatusInternalServerError, "threads_unavailable")
		return
	}

	threads := make([]runtimeThread, 0, len(listed.Sessions))
	for _, stored := range listed.Sessions {
		if stored == nil || strings.TrimSpace(stored.ID()) == "" {
			continue
		}
		updated := stored.LastUpdateTime().UTC()
		if updated.IsZero() {
			updated = time.Unix(0, 0).UTC()
		}
		nameValue, _ := stored.State().Get(sessionNameStateKey)
		name, _ := nameValue.(string)
		name = strings.TrimSpace(name)
		var namePointer *string
		if name != "" {
			namePointer = &name
		}
		timestamp := updated.Format(time.RFC3339Nano)
		threads = append(threads, runtimeThread{
			ID:             stored.ID(),
			OrganizationID: "",
			AgentID:        agentID,
			CreatedByID:    identity.UserID,
			Name:           namePointer,
			CreatedAt:      timestamp,
			UpdatedAt:      timestamp,
		})
	}
	slices.SortFunc(threads, func(left, right runtimeThread) int {
		if left.UpdatedAt != right.UpdatedAt {
			return cmp.Compare(right.UpdatedAt, left.UpdatedAt)
		}
		return strings.Compare(left.ID, right.ID)
	})

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(runtimeThreadsResponse{Threads: threads})
}
