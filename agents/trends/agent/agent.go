// Package trends ports the Python trends_agent: a Google Trends BigQuery
// analysis and verification agent that generates bounded SQL through a child
// AgentTool, executes it against the public Google Trends dataset, and
// renders the result as a catalog-valid A2UI surface.
//
// The A2UI step (generate_a2ui) calls its composer model.LLM inline rather
// than through a Gemini-backed sub-agent, unlike the Python port's
// ag_ui_adk-backed composition adktool. That is a required architectural
// change, not a simplification of convenience: ADK-Go's tool/agenttool wraps
// a sub-agent in its own throwaway in-memory session (see agenttool.Run), so
// any temp:a2ui_activity: state write made by a tool nested inside a
// sub-agent invoked via AgentTool never reaches the top-level session's
// event.Actions.StateDelta that internal/agui/converter.go reads to emit
// ACTIVITY_SNAPSHOT events. The A2UI tool has to live directly on the root
// agent to be observable by the AG-UI stream — the Python port's own comment
// ("A2UI tool lives directly on the root agent — no sub-agent traversal
// needed for ag_ui_adk's per-run event_queue wiring") documents the same
// constraint. New's composer parameter (internal/providers/gemini's direct
// Gemini adapter in production) is a plain model.LLM invoked with
// GenerateContent from inside generate_a2ui's own tool function — no nested
// agent, no isolated session, so its state write lands on the root agent's
// own context like every other trends adktool. See compose.go's composeA2UI
// for the composition-then-validate-then-fallback pipeline.
package trends

import (
	"fmt"
	"strings"

	_ "embed"

	"agents/internal/common"
	"agents/trends/agent/tools"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/session"
	adktool "google.golang.org/adk/v2/tool"
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
// nil, omits the web_search tool entirely. composer is optional: when nil
// (Gemini not configured — see cmd/gateway/main.go's trendsComposerModel),
// generate_a2ui degrades to the deterministic BuildA2UI surface instead of
// attempting an LLM composition; see compose.go's composeA2UI.
func New(m model.LLM, generator agent.Agent, executor *BigQueryExecutor, search *common.BraveSearch, composer model.LLM, toolsets ...adktool.Toolset) (agent.Agent, error) {
	if generator == nil || generator.Name() != GeneratorAppName {
		return nil, fmt.Errorf("trends requires a %s child agent", GeneratorAppName)
	}
	tools, err := rootTools(executor, search, composer)
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

func rootTools(executor *BigQueryExecutor, search *common.BraveSearch, composer model.LLM) ([]adktool.Tool, error) {
	validateTrendsSQLTool, err := tools.NewValidateTrendsSql(validateSQLTool)
	if err != nil {
		return nil, err
	}

	beginTrendsQueryTool, err := tools.NewBeginTrendsQuery(BeginTrendsQuery)
	if err != nil {
		return nil, err
	}

	executeBigquerySQLTool, err := tools.NewExecuteBigquerySql(executeSQLTool(executor))
	if err != nil {
		return nil, err
	}

	writeTrendsResultTool, err := tools.NewWriteTrendsResult(WriteTrendsResult)
	if err != nil {
		return nil, err
	}

	setTrendsVerificationTool, err := tools.NewSetTrendsVerification(SetTrendsVerification)
	if err != nil {
		return nil, err
	}

	generateA2uiTool, err := tools.NewGenerateA2ui(generateA2UITool(composer))
	if err != nil {
		return nil, err
	}

	result := []adktool.Tool{
		validateTrendsSQLTool,
		beginTrendsQueryTool,
		executeBigquerySQLTool,
		writeTrendsResultTool,
		setTrendsVerificationTool,
		generateA2uiTool,
	}

	if search != nil {
		webSearchTool, err := tools.NewWebSearch(func(ctx agent.Context, input SearchArgs) (SearchResult, error) {
			results, err := search.Search(ctx, input.Query, input.Count)
			return SearchResult{Results: results}, err
		})
		if err != nil {
			return nil, err
		}
		result = append(result, webSearchTool)
	}

	return result, nil
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

// generateA2UITool renders the saved TrendsState as a catalog-valid A2UI
// surface. When composer is non-nil it prefers an LLM-composed surface
// (composeA2UI), which itself falls back to the deterministic BuildA2UI
// output on any composer failure or invalid composition — so this tool
// always succeeds at rendering something, never fails because the composer
// misbehaved.
func generateA2UITool(composer model.LLM) functiontool.Func[GenerateA2UIArgs, Result] {
	return func(ctx agent.Context, _ GenerateA2UIArgs) (Result, error) {
		state := readState(ctx.State())
		event := composeA2UI(ctx, composer, TrendsResult{Query: state.Query, SQL: state.GeneratedSQL, Columns: state.Columns, Rows: state.Rows, Insights: state.Insights, Error: state.Error})
		key := strings.TrimSpace(ctx.FunctionCallID())
		if key == "" {
			key = event.MessageID
		}
		if err := ctx.State().Set(a2uiActivityStatePrefix+key, activityEnvelope{MessageID: event.MessageID, Content: event.Content}); err != nil {
			return failure("a2ui_state_write_failed", "failed to record the Trends A2UI activity"), nil
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
