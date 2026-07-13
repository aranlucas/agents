// Package trends ports the Python trends_agent: a Google Trends BigQuery
// analysis and verification agent that generates bounded SQL through a child
// AgentTool and executes it against the public Google Trends dataset.
package trends

import (
	_ "embed"
	"fmt"

	"agents/internal/common"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
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
	validateTrendsSQLTool, err := functiontool.New(functiontool.Config{
		Name:        "validate_trends_sql",
		Description: "Validate that generated SQL is a bounded, read-only SELECT/WITH query.",
	}, validateSQLTool)
	if err != nil {
		return nil, err
	}

	beginTrendsQueryTool, err := functiontool.New(functiontool.Config{
		Name:        "begin_trends_query",
		Description: "Mark the trends state 'querying' before BigQuery execution starts.",
	}, BeginTrendsQuery)
	if err != nil {
		return nil, err
	}

	executeBigquerySQLTool, err := functiontool.New(functiontool.Config{
		Name:        "execute_bigquery_sql",
		Description: "Execute bounded BigQuery SQL and return normalized columns and rows.",
	}, executeSQLTool(executor))
	if err != nil {
		return nil, err
	}

	writeTrendsResultTool, err := functiontool.New(functiontool.Config{
		Name:        "write_trends_result",
		Description: "Persist the final (or failed) Trends query result to state.",
	}, WriteTrendsResult)
	if err != nil {
		return nil, err
	}

	setTrendsVerificationTool, err := functiontool.New(functiontool.Config{
		Name:        "set_trends_verification",
		Description: "Append web-search verification notes to the trends insights in state.",
	}, SetTrendsVerification)
	if err != nil {
		return nil, err
	}

	result := []tool.Tool{
		validateTrendsSQLTool,
		beginTrendsQueryTool,
		executeBigquerySQLTool,
		writeTrendsResultTool,
		setTrendsVerificationTool,
	}

	if search != nil {
		webSearchTool, err := functiontool.New(functiontool.Config{
			Name:        "web_search",
			Description: "Search current public web results with the limited Brave budget.",
		}, func(ctx agent.Context, input SearchArgs) (SearchResult, error) {
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

type SearchArgs struct {
	Query string `json:"query"`
	Count int    `json:"count"`
}

type SearchResult struct {
	Results []common.SearchResult `json:"results"`
}
