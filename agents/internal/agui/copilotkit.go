package agui

import (
	"fmt"
	"log"
	"net/http"
	"slices"
	"strings"
	"sync"

	"agents/internal/agentruntime"
	"agents/internal/common"

	"google.golang.org/adk/v2/session"
)

// CopilotKitRuntimeVersion is the upstream runtime contract version mirrored
// by this gateway. Keep it aligned with the web/mobile CopilotKit packages.
const CopilotKitRuntimeVersion = "1.65.0"

type CapabilityFlag struct {
	Streaming bool `json:"streaming"`
}

type StateCapabilities struct {
	Snapshots       bool `json:"snapshots"`
	Deltas          bool `json:"deltas"`
	PersistentState bool `json:"persistentState"`
}

type ReasoningCapabilities struct {
	Supported bool `json:"supported"`
	Streaming bool `json:"streaming"`
}

type ToolCapabilities struct {
	Supported      bool `json:"supported"`
	ClientProvided bool `json:"clientProvided"`
}

type AgentCapabilities struct {
	Transport CapabilityFlag        `json:"transport"`
	State     StateCapabilities     `json:"state"`
	Reasoning ReasoningCapabilities `json:"reasoning"`
	Tools     ToolCapabilities      `json:"tools"`
}

func DefaultAgentCapabilities() AgentCapabilities {
	return AgentCapabilities{
		Transport: CapabilityFlag{Streaming: true},
		State:     StateCapabilities{Snapshots: true, Deltas: true, PersistentState: true},
		Reasoning: ReasoningCapabilities{Supported: true, Streaming: true},
		Tools:     ToolCapabilities{Supported: true, ClientProvided: true},
	}
}

type runtimeThreadEndpoints struct {
	List             bool `json:"list"`
	Inspect          bool `json:"inspect"`
	Mutations        bool `json:"mutations"`
	RealtimeMetadata bool `json:"realtimeMetadata"`
}

type runtimeAgentDescription struct {
	Name         string            `json:"name"`
	ClassName    string            `json:"className"`
	Description  string            `json:"description"`
	Capabilities AgentCapabilities `json:"capabilities"`
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
	suggestion func() http.Handler
}

// CopilotKitRuntime exposes the fetch-native v2 runtime's concrete SSE surface
// directly from the Go gateway. D1-backed ADK sessions provide durable connect
// replay; activeRuns adds low-latency local replay while D1 coordinates active
// ownership, replay, and cancellation across gateway replicas.
type CopilotKitRuntime struct {
	runner  *D1AgentRunner
	agents  []copilotKitAgent
	byID    map[string]copilotKitAgent
	byRoute map[string]copilotKitAgent
}

// NewCopilotKitRuntime eagerly binds each registry entry's run handler and
// reuses it for the raw /<route>/agui endpoint and CopilotKit's
// /agent/<id>/run endpoint. Suggestions are lazy for private agents, while
// public suggestions are eager so the public Resume homepage pays no handler
// construction cost on its first request.
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
	entries := registry.Entries()
	ids := make([]string, len(entries))
	seenIDs := make(map[string]bool, len(entries))
	for index, entry := range entries {
		id := strings.TrimSpace(clientID(entry.Route))
		if id == "" || strings.Contains(id, "/") || seenIDs[id] {
			return nil, fmt.Errorf("invalid or duplicate CopilotKit agent id %q", id)
		}
		seenIDs[id] = true
		ids[index] = id
	}

	runHandlers := make([]http.Handler, len(entries))
	runErrors := make([]error, len(entries))
	suggestionHandlers := make([]func() http.Handler, len(entries))
	suggestionErrors := make([]error, len(entries))
	var builds sync.WaitGroup
	for index, entry := range entries {
		builds.Go(func() {
			var err error
			runHandlers[index], err = runtime.runner.newRunHandler(entry, opts...)
			if err != nil {
				runErrors[index] = fmt.Errorf("build CopilotKit run handler for %s: %w", entry.Route, err)
			}
		})
		if entry.Public {
			builds.Go(func() {
				handler, err := NewStatelessEntryHandler(entry, opts...)
				if err != nil {
					suggestionErrors[index] = fmt.Errorf("build CopilotKit suggestion handler for %s: %w", entry.Route, err)
					return
				}
				suggestionHandlers[index] = func() http.Handler { return handler }
			})
		} else {
			suggestionHandlers[index] = lazySuggestionHandler(entry, opts...)
		}
	}
	builds.Wait()
	for index := range entries {
		if err := runErrors[index]; err != nil {
			return nil, err
		}
		if err := suggestionErrors[index]; err != nil {
			return nil, err
		}
	}

	for index, entry := range entries {
		agent := copilotKitAgent{
			id: ids[index], entry: entry, run: runHandlers[index],
			suggestion: suggestionHandlers[index],
		}
		runtime.agents = append(runtime.agents, agent)
		runtime.byID[ids[index]] = agent
		runtime.byRoute[entry.Route] = agent
	}
	return runtime, nil
}

func lazySuggestionHandler(entry agentruntime.Entry, opts ...Option) func() http.Handler {
	// The runtime is long-lived, so retain the caller's construction options
	// without retaining a mutable slice that could be changed after startup.
	constructionOptions := slices.Clone(opts)
	return sync.OnceValue(func() http.Handler {
		handler, err := NewStatelessEntryHandler(entry, constructionOptions...)
		if err == nil {
			return handler
		}
		log.Printf("build CopilotKit suggestion handler for %s: %v", entry.Route, err)
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			writeJSONErrorMessage(w, http.StatusInternalServerError, "Suggestion handler unavailable", "The suggestion handler could not be initialized.")
		})
	})
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
		mux.Handle("POST "+base+"/suggest", lazyHandler(agent.suggestion))
		mux.Handle("POST "+base+"/connect", r.runner.connectHandler(agent))
		mux.Handle("POST "+base+"/stop/{threadId}", r.runner.stopHandler(agent))
	}
}

func lazyHandler(load func() http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		load().ServeHTTP(w, r)
	})
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
	capabilities := DefaultAgentCapabilities()
	agents := make(map[string]runtimeAgentDescription, len(r.agents))
	for _, agent := range r.agents {
		agents[agent.id] = runtimeAgentDescription{
			Name:         agent.id,
			ClassName:    "ADKGoAgent",
			Description:  agent.entry.AppName,
			Capabilities: capabilities,
		}
	}
	if err := common.WriteJSON(w, http.StatusOK, runtimeInfoResponse{
		Version:         CopilotKitRuntimeVersion,
		Agents:          agents,
		Mode:            "sse",
		ThreadEndpoints: runtimeThreadEndpoints{List: true},
		Suggestions:     true,
	}); err != nil {
		log.Printf("write JSON response: %v", err)
	}
}
