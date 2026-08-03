package agui

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"agents/internal/agentruntime"
	"google.golang.org/adk/v2/session"
)

// CopilotKitRuntimeVersion is the upstream runtime contract version mirrored
// by this gateway. Keep it aligned with the web/mobile CopilotKit packages.
const CopilotKitRuntimeVersion = "1.65.0"

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
	runner  *D1AgentRunner
	agents  []copilotKitAgent
	byID    map[string]copilotKitAgent
	byRoute map[string]copilotKitAgent
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

	runner, err := NewD1AgentRunner(sessions)
	if err != nil {
		return nil, err
	}
	runtime := &CopilotKitRuntime{
		runner:  runner,
		byID:    make(map[string]copilotKitAgent),
		byRoute: make(map[string]copilotKitAgent),
	}
	seenIDs := make(map[string]bool)
	for _, entry := range registry.Entries() {
		id := strings.TrimSpace(clientID(entry.Route))
		if id == "" || strings.Contains(id, "/") || seenIDs[id] {
			return nil, fmt.Errorf("invalid or duplicate CopilotKit agent id %q", id)
		}
		seenIDs[id] = true

		run, err := runtime.runner.newRunHandler(entry, opts...)
		if err != nil {
			return nil, fmt.Errorf("build CopilotKit run handler for %s: %w", entry.Route, err)
		}
		suggestion, err := NewStatelessEntryHandler(entry, opts...)
		if err != nil {
			return nil, fmt.Errorf("build CopilotKit suggestion handler for %s: %w", entry.Route, err)
		}
		agent := copilotKitAgent{id: id, entry: entry, run: run, suggestion: suggestion}
		runtime.agents = append(runtime.agents, agent)
		runtime.byID[id] = agent
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
	mux.HandleFunc("GET /threads", r.listThreads)
	for _, agent := range r.agents {
		base := "/agent/" + agent.id
		mux.Handle("POST "+base+"/run", agent.run)
		mux.Handle("POST "+base+"/suggest", agent.suggestion)
		mux.Handle("POST "+base+"/connect", r.runner.connectHandler(agent))
		mux.Handle("POST "+base+"/stop/{threadId}", r.runner.stopHandler(agent))
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
		ThreadEndpoints: runtimeThreadEndpoints{List: true},
		Suggestions:     true,
	})
}
