package agui

import (
	"context"
	"encoding/json"
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

// CopilotKitRuntimeVersion is the upstream runtime contract version mirrored
// by this gateway. Keep it aligned with the web/mobile CopilotKit packages.
const CopilotKitRuntimeVersion = "1.62.3"

type runtimeCapabilityFlag struct {
	Streaming bool `json:"streaming"`
}

type runtimeStateCapabilities struct {
	Snapshots       bool `json:"snapshots"`
	Deltas          bool `json:"deltas"`
	PersistentState bool `json:"persistentState"`
}

type runtimeReasoningCapabilities struct {
	Supported bool `json:"supported"`
	Streaming bool `json:"streaming"`
}

type runtimeToolCapabilities struct {
	Supported      bool `json:"supported"`
	ClientProvided bool `json:"clientProvided"`
}

type runtimeAgentCapabilities struct {
	Transport runtimeCapabilityFlag        `json:"transport"`
	State     runtimeStateCapabilities     `json:"state"`
	Reasoning runtimeReasoningCapabilities `json:"reasoning"`
	Tools     runtimeToolCapabilities      `json:"tools"`
}

type runtimeThreadEndpoints struct {
	List             bool `json:"list"`
	Inspect          bool `json:"inspect"`
	Mutations        bool `json:"mutations"`
	RealtimeMetadata bool `json:"realtimeMetadata"`
}

type runtimeAgentDescription struct {
	Name         string                   `json:"name"`
	ClassName    string                   `json:"className"`
	Description  string                   `json:"description"`
	Capabilities runtimeAgentCapabilities `json:"capabilities"`
}

type runtimeInfoResponse struct {
	Version                       string                             `json:"version"`
	Agents                        map[string]runtimeAgentDescription `json:"agents"`
	AudioFileTranscriptionEnabled bool                               `json:"audioFileTranscriptionEnabled"`
	Mode                          string                             `json:"mode"`
	ThreadEndpoints               runtimeThreadEndpoints             `json:"threadEndpoints"`
	Suggestions                   bool                               `json:"suggestions"`
	A2UIEnabled                   bool                               `json:"a2uiEnabled"`
	OpenGenerativeUIEnabled       bool                               `json:"openGenerativeUIEnabled"`
	TelemetryDisabled             bool                               `json:"telemetryDisabled"`
}

type copilotKitAgent struct {
	id         string
	entry      agentruntime.Entry
	run        http.Handler
	suggestion http.Handler
}

// CopilotKitRuntime exposes the fetch-native v2 runtime's concrete SSE surface
// directly from the Go gateway. D1-backed ADK sessions provide durable connect
// replay; activeRuns adds only process-local live replay and cancellation.
type CopilotKitRuntime struct {
	sessions session.Service
	active   *activeRuns
	agents   []copilotKitAgent
	byRoute  map[string]copilotKitAgent
}

// NewCopilotKitRuntime binds every registry entry once and reuses the same ADK
// handler for the raw /<route>/agui endpoint and CopilotKit's
// /agent/<id>/run endpoint.
func NewCopilotKitRuntime(registry *agentruntime.Registry, sessions session.Service, clientID func(string) string, opts ...Option) (*CopilotKitRuntime, error) {
	if registry == nil {
		return nil, fmt.Errorf("agent registry is required")
	}
	if sessions == nil {
		return nil, fmt.Errorf("session service is required")
	}
	if clientID == nil {
		clientID = func(route string) string { return route }
	}

	runtime := &CopilotKitRuntime{
		sessions: sessions,
		active:   newActiveRuns(),
		byRoute:  make(map[string]copilotKitAgent),
	}
	seenIDs := make(map[string]bool)
	for _, entry := range registry.Entries() {
		id := strings.TrimSpace(clientID(entry.Route))
		if id == "" || strings.Contains(id, "/") || seenIDs[id] {
			return nil, fmt.Errorf("invalid or duplicate CopilotKit agent id %q", id)
		}
		seenIDs[id] = true

		runOptions := append([]Option(nil), opts...)
		runOptions = append(runOptions, withActiveRuns(runtime.active))
		run, err := NewEntryHandler(entry, sessions, runOptions...)
		if err != nil {
			return nil, fmt.Errorf("build CopilotKit run handler for %s: %w", entry.Route, err)
		}
		suggestion, err := NewStatelessEntryHandler(entry, opts...)
		if err != nil {
			return nil, fmt.Errorf("build CopilotKit suggestion handler for %s: %w", entry.Route, err)
		}
		agent := copilotKitAgent{id: id, entry: entry, run: run, suggestion: suggestion}
		runtime.agents = append(runtime.agents, agent)
		runtime.byRoute[entry.Route] = agent
	}
	return runtime, nil
}

// EntryHandler returns the shared handler mounted at /<route>/agui.
func (r *CopilotKitRuntime) EntryHandler(route string) (http.Handler, bool) {
	agent, ok := r.byRoute[route]
	return agent.run, ok
}

// Register mounts the multi-route CopilotKit v2 REST/SSE contract.
func (r *CopilotKitRuntime) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /info", r.info)
	for _, agent := range r.agents {
		base := "/agent/" + agent.id
		mux.Handle("POST "+base+"/run", agent.run)
		mux.Handle("POST "+base+"/suggest", agent.suggestion)
		mux.Handle("POST "+base+"/connect", r.connectHandler(agent))
		mux.Handle("POST "+base+"/stop/{threadId}", r.stopHandler(agent))
	}
}

// PublicRoutes returns exact paths plus trailing-* prefixes understood by the
// gateway auth middleware. Only registry entries explicitly marked Public are
// exposed anonymously.
func (r *CopilotKitRuntime) PublicRoutes() map[string]bool {
	public := map[string]bool{"/info": true}
	for _, agent := range r.agents {
		if !agent.entry.Public {
			continue
		}
		base := "/agent/" + agent.id
		public[base+"/run"] = true
		public[base+"/suggest"] = true
		public[base+"/connect"] = true
		public[base+"/stop/*"] = true
	}
	return public
}

func (r *CopilotKitRuntime) info(w http.ResponseWriter, _ *http.Request) {
	capabilities := runtimeAgentCapabilities{
		Transport: runtimeCapabilityFlag{Streaming: true},
		State: runtimeStateCapabilities{
			Snapshots: true, Deltas: true, PersistentState: true,
		},
		Reasoning: runtimeReasoningCapabilities{Supported: true, Streaming: true},
		Tools:     runtimeToolCapabilities{Supported: true, ClientProvided: true},
	}
	agents := make(map[string]runtimeAgentDescription, len(r.agents))
	for _, agent := range r.agents {
		agents[agent.id] = runtimeAgentDescription{
			Name:         agent.id,
			ClassName:    "ADKGoAgent",
			Description:  agent.entry.AppName,
			Capabilities: capabilities,
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(runtimeInfoResponse{
		Version:         CopilotKitRuntimeVersion,
		Agents:          agents,
		Mode:            "sse",
		ThreadEndpoints: runtimeThreadEndpoints{},
		Suggestions:     true,
	})
}

func (r *CopilotKitRuntime) connectHandler(agent copilotKitAgent) http.Handler {
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
		_ = frame.WriteEvent(ctx, w, events.NewRunFinishedEventWithOptions(input.ThreadID, input.RunID, events.WithSuccessOutcome()))
	})
}

func (r *CopilotKitRuntime) stopHandler(agent copilotKitAgent) http.Handler {
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
			_ = json.NewEncoder(w).Encode(map[string]any{
				"stopped": false,
				"message": fmt.Sprintf("No active run for thread '%s'.", threadID),
			})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
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
