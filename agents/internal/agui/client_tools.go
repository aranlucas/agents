// Package agui implements the AG-UI protocol boundary for ADK-Go.
package agui

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"

	"agents/internal/auth"
	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/types"
	"github.com/google/jsonschema-go/jsonschema"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
	"google.golang.org/genai"
)

const maximumToolSchema = 64 << 10

var (
	ErrPendingToolNotFound = errors.New("pending client tool not found")
	// ClientToolName validates a frontend tool name. These come from our own
	// AG-UI client tool declarations, so they're required to look like
	// identifiers. Exported so PendingTools implementations outside this
	// package (e.g. a D1-backed store) can apply the same contract without
	// depending on this package.
	ClientToolName = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_.:-]{0,63}$`)
	// ClientCallID validates a tool-call identity token. Unlike
	// ClientToolName, call IDs are assigned by the model provider (or by
	// ADK's own "adk-"+uuid fallback when a provider omits one), not by us —
	// some providers issue IDs that don't look like identifiers (e.g. a bare
	// leading digit), so this only bounds length and excludes control
	// characters rather than requiring identifier shape.
	ClientCallID = regexp.MustCompile(`^[^\x00-\x1f]{1,128}$`)
)

// ToolScope is the complete authorization boundary for one pending call.
type ToolScope struct{ AppName, UserID, ThreadID string }

// PendingTools persists frontend calls until a scoped result resumes them.
// Handler depends only on this interface — never on a concrete store — so
// any backend (D1, or otherwise) can be plugged in via WithPendingTools.
type PendingTools interface {
	Register(context.Context, ToolScope, string, string, json.RawMessage) error
	Resolve(context.Context, auth.Identity, string, string, string, json.RawMessage) error
	Take(context.Context, auth.Identity, string, string, string) (*genai.FunctionResponse, error)
}

type clientToolStatus string

const clientToolStatusPending clientToolStatus = "pending"

type clientToolPendingResult struct {
	Status clientToolStatus `json:"status"`
	CallID string           `json:"call_id"`
}

func buildClientTools(input []types.Tool, pending PendingTools) ([]tool.Tool, error) {
	if pending == nil {
		return nil, errors.New("pending client tool store is required")
	}
	tools := make([]tool.Tool, 0, len(input))
	seen := make(map[string]bool)
	for _, definition := range input {
		if !ClientToolName.MatchString(definition.Name) || seen[definition.Name] {
			return nil, fmt.Errorf("invalid or duplicate client tool %q", definition.Name)
		}
		seen[definition.Name] = true
		schema, err := clientSchema(definition.Parameters)
		if err != nil {
			return nil, fmt.Errorf("client tool %q schema: %w", definition.Name, err)
		}
		name := definition.Name
		wrapped, err := functiontool.New[map[string]json.RawMessage, clientToolPendingResult](functiontool.Config{Name: name, Description: definition.Description, InputSchema: schema, IsLongRunning: true}, func(ctx agent.Context, args map[string]json.RawMessage) (clientToolPendingResult, error) {
			scope := ToolScope{AppName: ctx.AppName(), UserID: ctx.UserID(), ThreadID: ctx.SessionID()}
			encoded, err := json.Marshal(args)
			if err != nil {
				return clientToolPendingResult{}, errors.New("encode client tool arguments")
			}
			if err := pending.Register(ctx, scope, ctx.FunctionCallID(), name, encoded); err != nil {
				return clientToolPendingResult{}, err
			}
			return clientToolPendingResult{Status: clientToolStatusPending, CallID: ctx.FunctionCallID()}, nil
		})
		if err != nil {
			return nil, err
		}
		tools = append(tools, wrapped)
	}
	return tools, nil
}

// ClientToolsStateKey is the temp: state key the AG-UI handler overlays
// with the current run's AG-UI tool declarations (JSON-encoded
// []AG-UI Tool) via runner.WithStateDelta, and that
// AGUIToolset reads on every invocation.
//
// This is the per-invocation extension point ADK-Go v2 actually provides
// for dynamic, request-scoped tools: tool.Toolset.Tools(ctx) is called
// with a fresh agent.ReadonlyContext on every LLM turn (see
// google.golang.org/adk/v2/internal/llminternal/tools_processor.go —
// toolProcessor re-resolves every agent Toolset each call), and
// runner.WithStateDelta lands on the session before that turn is built
// (runner.Run -> appendMessageToSession -> SessionService.AppendEvent,
// which happens before the node/workflow runs — see
// google.golang.org/adk/v2/runner/run_node.go). So a single
// AGUIToolset instance, attached once at agent-
// construction time via llmagent.Config.Toolsets, transparently observes
// a different set of client tools on every request without needing the
// framework to reconstruct or swap the toolset itself.
//
// This mirrors the Python ag_ui_adk package's design one level up: there,
// ADKAgent physically substitutes a placeholder AGUIToolset for a
// per-run ClientProxyToolset in a shallow copy of the agent tree
// (ag_ui_adk/agui_toolset.py, ag_ui_adk/client_proxy_toolset.py) because
// ADK-Python's tool resolution is comparatively static. ADK-Go's
// Toolset.Tools callback already receives per-invocation context, so the
// same per-run behavior is achieved by reading invocation state instead
// of replacing the toolset object.
const ClientToolsStateKey = session.KeyPrefixTemp + "agui_client_tools"

// AGUIToolset is the construction-time declaration for frontend tools. Like
// the official Python middleware's AGUIToolset placeholder, it becomes a
// fresh set of client proxy tools for each AG-UI run. ADK-Go resolves
// Toolset.Tools with invocation context on every turn, so no shared agent
// mutation or per-run agent-tree copy is needed.
type AGUIToolset struct {
	pending PendingTools
}

// NewAGUIToolset declares request-scoped AG-UI frontend tools on an agent.
func NewAGUIToolset(pending PendingTools) *AGUIToolset {
	return &AGUIToolset{pending: pending}
}

func (r *AGUIToolset) Name() string { return "agui_client_tools" }

// Tools reads this invocation's client tool declarations (a JSON-encoded
// []AG-UI Tool at ClientToolsStateKey) from ctx's readonly state and
// builds fresh long-running proxy tools for them. Returns (nil, nil) —
// not an error — when the current request declared no client tools (the
// common case), so agents that mix static tools with AG-UI client tools
// are unaffected on runs that supply none.
func (r *AGUIToolset) Tools(ctx agent.ReadonlyContext) ([]tool.Tool, error) {
	if r.pending == nil {
		return nil, nil
	}
	state := ctx.ReadonlyState()
	if state == nil {
		return nil, nil
	}
	raw, err := state.Get(ClientToolsStateKey)
	if err != nil || raw == nil {
		return nil, nil
	}
	encoded, ok := raw.(string)
	if !ok || encoded == "" {
		return nil, nil
	}
	var defs []types.Tool
	if err := json.Unmarshal([]byte(encoded), &defs); err != nil || len(defs) == 0 {
		return nil, nil
	}
	tools, err := buildClientTools(defs, r.pending)
	if err != nil {
		return nil, fmt.Errorf("resolve request-scoped client tools: %w", err)
	}
	return tools, nil
}

func clientSchema(value any) (*jsonschema.Schema, error) {
	if value == nil {
		return &jsonschema.Schema{Type: "object", Properties: map[string]*jsonschema.Schema{}}, nil
	}
	encoded, err := json.Marshal(value)
	if err != nil || len(encoded) > maximumToolSchema {
		return nil, errors.New("invalid or oversized JSON schema")
	}
	var schema jsonschema.Schema
	if json.Unmarshal(encoded, &schema) != nil {
		return nil, errors.New("invalid JSON schema")
	}
	if schema.Type != "" && schema.Type != "object" {
		return nil, errors.New("client tool parameters must be an object")
	}
	return &schema, nil
}
