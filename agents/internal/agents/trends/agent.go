// Package trends ports the Python trends_agent: a Google Trends BigQuery
// analysis and verification agent that generates bounded SQL through a child
// AgentTool, executes it against the public Google Trends dataset, and
// renders the result as a catalog-valid A2UI surface.
//
// The A2UI step (generate_a2ui, see a2ui.go's BuildA2UI) is deterministic Go
// code rather than an LLM call, unlike the Python port's ag_ui_adk-backed
// composition tool. That is a required architectural change, not a
// simplification of convenience: ADK-Go's tool/agenttool wraps a sub-agent
// in its own throwaway in-memory session (see agenttool.Run), so any
// temp:a2ui_activity: state write made by a tool nested inside a sub-agent
// invoked via AgentTool never reaches the top-level session's
// event.Actions.StateDelta that internal/agui/converter.go reads to emit
// ACTIVITY_SNAPSHOT events. The A2UI tool has to live directly on the root
// agent to be observable by the AG-UI stream — the Python port's own comment
// ("A2UI tool lives directly on the root agent — no sub-agent traversal
// needed for ag_ui_adk's per-run event_queue wiring") documents the same
// constraint. A genuinely Gemini-backed A2UI subagent would silently drop
// its own output, so internal/providers/gemini is not wired into this
// package; it exists as a general-purpose direct model.LLM adapter for
// future direct-Gemini consumers instead.
package trends

import (
	"context"
	"errors"
	"fmt"
	"strings"

	_ "embed"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
	"github.com/aranlucas/agents/agents/internal/agents/common"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/agenttool"
	"google.golang.org/adk/v2/tool/functiontool"
)

//go:embed instructions.md
var Instruction string

//go:embed generator_instructions.md
var GeneratorInstruction string

// GeneratorAppName is the child SQL-generation agent's name. It is used both
// as the AgentTool's tool name (agenttool derives the tool name from
// agent.Agent.Name()) and to validate the caller wired the right child into
// New.
const GeneratorAppName = "TrendsQueryGeneratorAgent"

// a2uiActivityStatePrefix matches internal/agui/converter.go's unexported
// a2uiActivityStatePrefix constant. Duplicated here rather than imported
// because agui intentionally keeps that constant private (see
// internal/mcp/excalidraw.go's activityStatePrefix for the same pattern).
const a2uiActivityStatePrefix = session.KeyPrefixTemp + "a2ui_activity:"

// New builds the root GoogleTrendsAgent. generator must be the child SQL
// generator built by NewGenerator; executor may be nil in tests that never
// exercise execute_bigquery_sql (the tool then returns a structured "not
// configured" error instead of panicking); search is optional and, when
// nil, omits the web_search tool entirely.
func New(m model.LLM, generator agent.Agent, executor *BigQueryExecutor, search *common.BraveSearch, toolsets ...tool.Toolset) (agent.Agent, error) {
	if generator == nil || generator.Name() != GeneratorAppName {
		return nil, fmt.Errorf("trends requires a %s child agent", GeneratorAppName)
	}
	tools, err := rootTools(executor, search)
	if err != nil {
		return nil, err
	}
	tools = append(tools, agenttool.New(generator, nil))
	return llmagent.New(llmagent.Config{
		Name: AppName, Description: "Google Trends BigQuery analysis and verification.",
		Instruction: Instruction, Model: m, Mode: llmagent.ModeChat, Tools: tools, Toolsets: toolsets,
	})
}

// NewGenerator builds the child SQL-generation agent invoked as an AgentTool
// by the root GoogleTrendsAgent. It takes the user's analytical question as
// a tool-call "request" string (agenttool's default schema, since no
// InputSchema is set) and returns bounded BigQuery SQL as its text response.
func NewGenerator(m model.LLM) (agent.Agent, error) {
	return llmagent.New(llmagent.Config{
		Name: GeneratorAppName, Description: "Generates bounded BigQuery SQL for a Google Trends analytical question.",
		Instruction: GeneratorInstruction, Model: m, OutputKey: "generated_sql",
	})
}

func rootTools(executor *BigQueryExecutor, search *common.BraveSearch) ([]tool.Tool, error) {
	var tools []tool.Tool
	add := func(value tool.Tool, err error) error {
		if err != nil {
			return err
		}
		tools = append(tools, value)
		return nil
	}
	if err := add(functiontool.New(functiontool.Config{Name: "validate_trends_sql", Description: "Validate that generated SQL is a bounded, read-only SELECT/WITH query."}, validateSQLTool)); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "begin_trends_query", Description: "Mark the trends state 'querying' before BigQuery execution starts."}, wrap(func(_ context.Context, tx *agentruntime.Transaction, input BeginQueryArgs) (Result, error) {
		return BeginTrendsQuery(tx, input)
	}))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "execute_bigquery_sql", Description: "Execute bounded BigQuery SQL and return normalized columns and rows."}, executeSQLTool(executor))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "write_trends_result", Description: "Persist the final (or failed) Trends query result to state."}, wrap(func(_ context.Context, tx *agentruntime.Transaction, input WriteResultArgs) (Result, error) {
		return WriteTrendsResult(tx, input)
	}))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "set_trends_verification", Description: "Append web-search verification notes to the trends insights in state."}, wrap(func(_ context.Context, tx *agentruntime.Transaction, input VerificationArgs) (Result, error) {
		return SetTrendsVerification(tx, input)
	}))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "generate_a2ui", Description: "Render the saved Trends result as a catalog-valid A2UI surface."}, generateA2UITool())); err != nil {
		return nil, err
	}
	if search != nil {
		if err := add(functiontool.New(functiontool.Config{Name: "web_search", Description: "Search current public web results with the limited Brave budget."}, func(ctx agent.Context, input SearchArgs) (SearchResult, error) {
			results, err := search.Search(ctx, input.Query, input.Count)
			return SearchResult{Results: results}, err
		})); err != nil {
			return nil, err
		}
	}
	return tools, nil
}

type ValidateSQLArgs struct {
	SQL string `json:"sql"`
}

func validateSQLTool(_ agent.Context, input ValidateSQLArgs) (Result, error) {
	cleaned := CleanSQL(input.SQL)
	if err := ValidateSQL(cleaned); err != nil {
		return failure("unsafe_sql", "The Trends SQL generator returned an unsupported or unbounded query."), nil
	}
	return Result{OK: true, SQL: cleaned}, nil
}

type ExecuteSQLArgs struct {
	SQL string `json:"sql"`
}

func executeSQLTool(executor *BigQueryExecutor) functiontool.Func[ExecuteSQLArgs, Result] {
	return func(ctx agent.Context, input ExecuteSQLArgs) (Result, error) {
		if executor == nil {
			return failure("bigquery_not_configured", "BigQuery is not configured for the Trends agent."), nil
		}
		result, err := executor.ExecuteBigQuery(ctx, input.SQL)
		if err != nil {
			return failure("bigquery_query_failed", "BigQuery query failed."), nil
		}
		return Result{OK: true, Columns: result.Columns, Rows: result.Rows, RowCount: len(result.Rows)}, nil
	}
}

// GenerateA2UIArgs is generate_a2ui's tool input: intentionally empty, since
// the surface is built entirely from the persisted TrendsState (query, SQL,
// columns, rows) rather than from ad hoc LLM-authored parameters.
type GenerateA2UIArgs struct{}

type activityEnvelope struct {
	MessageID string `json:"messageId"`
	Content   any    `json:"content"`
}

func generateA2UITool() functiontool.Func[GenerateA2UIArgs, Result] {
	return func(ctx agent.Context, _ GenerateA2UIArgs) (Result, error) {
		state := decodeState(agentruntime.NewTransactionFromState(ctx.State()))
		event := BuildA2UI(TrendsResult{Query: state.Query, SQL: state.GeneratedSQL, Columns: state.Columns, Rows: state.Rows, Insights: state.Insights, Error: state.Error})
		key := strings.TrimSpace(ctx.FunctionCallID())
		if key == "" {
			key = event.MessageID
		}
		if err := ctx.State().Set(a2uiActivityStatePrefix+key, activityEnvelope{MessageID: event.MessageID, Content: event.Content}); err != nil {
			return Result{}, errors.New("record trends A2UI activity")
		}
		return Result{OK: true}, nil
	}
}

type SearchArgs struct {
	Query string `json:"query"`
	Count int    `json:"count"`
}

type SearchResult struct {
	Results []common.SearchResult `json:"results"`
}

type handler[A any] func(context.Context, *agentruntime.Transaction, A) (Result, error)

// wrap adapts a state-mutating handler into a functiontool.Func. Unlike
// several other ported agents' wrap helpers, every trends handler wrapped
// this way (BeginTrendsQuery, WriteTrendsResult, SetTrendsVerification)
// unconditionally mutates state — including on a query failure, since
// recording the error in state is the point of write_trends_result — so
// there is no validate-then-reject-without-mutating branch to gate Commit
// on; a returned Go error is the only "don't commit" case, and that already
// skips Commit by returning early.
func wrap[A any](handler handler[A]) functiontool.Func[A, Result] {
	return func(ctx agent.Context, input A) (Result, error) {
		tx := agentruntime.NewTransactionFromState(ctx.State())
		result, err := handler(ctx, tx, input)
		if err != nil {
			return Result{}, err
		}
		if err := agentruntime.Commit(ctx, tx); err != nil {
			return Result{}, fmt.Errorf("commit trends state: %w", err)
		}
		return result, nil
	}
}
