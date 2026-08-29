package trends

import (
	"context"
	"iter"
	"maps"
	"strings"
	"sync"
	"testing"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/runner"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

type fakeModel struct{}

func (fakeModel) Name() string { return "fake" }
func (fakeModel) GenerateContent(context.Context, *model.LLMRequest, bool) iter.Seq2[*model.LLMResponse, error] {
	return func(func(*model.LLMResponse, error) bool) {}
}

func TestNewRequiresTheTrendsQueryGeneratorChild(t *testing.T) {
	if _, err := New(fakeModel{}, nil, nil, nil); err == nil {
		t.Fatal("New(nil generator) succeeded unexpectedly")
	}
	otherAgent, err := agent.New(agent.Config{Name: "not_the_generator"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := New(fakeModel{}, otherAgent, nil, nil); err == nil {
		t.Fatal("New(wrong-named generator) succeeded unexpectedly")
	}
	generator, err := NewGenerator(fakeModel{})
	if err != nil {
		t.Fatal(err)
	}
	built, err := New(fakeModel{}, generator, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if built.Name() != AppName {
		t.Fatalf("Name() = %q, want %q", built.Name(), AppName)
	}
}

func TestNewGeneratorInstructionCoversTableStructureAndFewShots(t *testing.T) {
	generator, err := NewGenerator(fakeModel{})
	if err != nil {
		t.Fatal(err)
	}
	if generator.Name() != GeneratorAppName {
		t.Fatalf("Name() = %q, want %q", generator.Name(), GeneratorAppName)
	}
	for _, want := range []string{"top_terms", "MAX(refresh_date)", "ranked rows per DMA", "COUNT(DISTINCT dma_name)", "average_dma_rank"} {
		if !strings.Contains(GeneratorInstruction, want) {
			t.Fatalf("generator instruction missing %q", want)
		}
	}
	if strings.Contains(GeneratorInstruction, "identical rank/score") {
		t.Fatal("generator instruction still describes DMA metrics as identical")
	}
}

func TestInstructionOrdersExecutionAndVerification(t *testing.T) {
	for _, want := range []string{"TrendsQueryGeneratorAgent", "validate_trends_sql", "begin_trends_query", "execute_bigquery_sql", "write_trends_result", "set_trends_verification", "Brave", "CONFIRMED", "CONTRADICTED", "UNVERIFIED"} {
		if !strings.Contains(Instruction, want) {
			t.Fatalf("instruction missing %q", want)
		}
	}
	if strings.Contains(Instruction, "generate_a2ui") {
		t.Fatal("instruction still references removed A2UI tooling")
	}
	if strings.Index(Instruction, "TrendsQueryGeneratorAgent") > strings.Index(Instruction, "validate_trends_sql") {
		t.Fatal("instruction must generate SQL before validating it")
	}
	if !strings.Contains(Instruction, "Never describe an execution failure as an unsafe") {
		t.Fatal("instruction must distinguish execution failures from SQL validation failures")
	}
}

func TestValidateSQLToolCleansAndAcceptsBoundedQueries(t *testing.T) {
	result, err := validateSQLTool(nil, ValidateSQLArgs{SQL: "```sql\nSELECT 1 LIMIT 10\n```"})
	if err != nil || !result.OK || result.SQL != "SELECT 1 LIMIT 10" {
		t.Fatalf("result = %#v, err = %v", result, err)
	}
	result, err = validateSQLTool(nil, ValidateSQLArgs{SQL: "SELECT * FROM x"})
	if err != nil || result.OK || result.Error == nil {
		t.Fatalf("unbounded query should fail safely: result = %#v, err = %v", result, err)
	}
	result, err = validateSQLTool(nil, ValidateSQLArgs{SQL: "SELECT term, rank, score FROM `bigquery-public-data.google_trends.top_terms` GROUP BY term, rank, score LIMIT 10"})
	if err != nil || result.OK || result.Error == nil {
		t.Fatalf("US query that ignores the DMA grain should fail safely: result = %#v, err = %v", result, err)
	}
	result, err = validateSQLTool(nil, ValidateSQLArgs{SQL: "SELECT term, COUNT(DISTINCT dma_name) AS dma_count FROM `bigquery-public-data.google_trends.top_terms` GROUP BY term LIMIT 10"})
	if err != nil || !result.OK {
		t.Fatalf("US query that handles the DMA grain should pass: result = %#v, err = %v", result, err)
	}
}

func TestExecuteSQLToolReportsUnconfiguredBigQueryWithoutPanicking(t *testing.T) {
	result, err := executeSQLTool(nil)(nil, ExecuteSQLArgs{SQL: "SELECT 1 LIMIT 10"})
	if err != nil || result.OK || result.Error == nil || result.Error.Code != "bigquery_not_configured" {
		t.Fatalf("result = %#v, err = %v", result, err)
	}
}

func TestBigQueryExecutionFailureReportsProcessingLimit(t *testing.T) {
	result := bigQueryExecutionFailure(errBigQueryBytesLimitExceeded)
	if result.Error == nil || result.Error.Code != "bigquery_bytes_limit_exceeded" || !strings.Contains(result.Error.Message, "processing limit") {
		t.Fatalf("result = %#v, want safe processing-limit error", result)
	}
}

type scriptedModel struct {
	mu        sync.Mutex
	responses []*model.LLMResponse
	index     int
}

func (*scriptedModel) Name() string { return "scripted" }
func (m *scriptedModel) GenerateContent(context.Context, *model.LLMRequest, bool) iter.Seq2[*model.LLMResponse, error] {
	m.mu.Lock()
	index := m.index
	m.index++
	m.mu.Unlock()
	return func(yield func(*model.LLMResponse, error) bool) {
		if index < len(m.responses) {
			yield(m.responses[index], nil)
			return
		}
		yield(&model.LLMResponse{Content: genai.NewContentFromText("done", genai.RoleModel), TurnComplete: true}, nil)
	}
}

func functionCall(id, name string, args map[string]any) *model.LLMResponse {
	return &model.LLMResponse{Content: &genai.Content{Role: genai.RoleModel, Parts: []*genai.Part{{FunctionCall: &genai.FunctionCall{ID: id, Name: name, Args: args}}}}, TurnComplete: true}
}

func TestTrendsAgentPipelineWritesVerifiedState(t *testing.T) {
	const generatedSQL = "SELECT\n  term, COUNT(DISTINCT dma_name) AS dma_count\nFROM `bigquery-public-data.google_trends.top_terms`\nGROUP BY term\nLIMIT 10;"
	generator, err := NewGenerator(&scriptedModel{responses: []*model.LLMResponse{{Content: genai.NewContentFromText(generatedSQL, genai.RoleModel), TurnComplete: true}}})
	if err != nil {
		t.Fatal(err)
	}
	rootModel := &scriptedModel{responses: []*model.LLMResponse{
		functionCall("gen", GeneratorAppName, map[string]any{"request": "top terms in the US"}),
		functionCall("validate", "validate_trends_sql", map[string]any{"sql": generatedSQL}),
		functionCall("begin", "begin_trends_query", map[string]any{"query": "top terms in the US", "sql": generatedSQL}),
		functionCall("write", "write_trends_result", map[string]any{
			"query": "top terms in the US", "sql": generatedSQL,
			"columns": []any{"term", "rank"}, "rows": []any{map[string]any{"term": "solar eclipse", "rank": int64(1)}},
			"insights": "Solar eclipse leads this week's results.",
		}),
		functionCall("verify", "set_trends_verification", map[string]any{"verification": "CONFIRMED: solar eclipse tracks a real event this week. High confidence."}),
		{Content: genai.NewContentFromText("Trends analysis ready.", genai.RoleModel), TurnComplete: true},
	}}
	built, err := New(rootModel, generator, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	service := session.InMemoryService()
	if _, err := service.Create(t.Context(), &session.CreateRequest{AppName: AppName, UserID: "user", SessionID: "thread", State: StateDefaults()}); err != nil {
		t.Fatal(err)
	}
	run, err := runner.New(runner.Config{AppName: AppName, Agent: built, SessionService: service})
	if err != nil {
		t.Fatal(err)
	}
	for _, runErr := range run.Run(t.Context(), "user", "thread", genai.NewContentFromText("What's trending this week?", genai.RoleUser), agent.RunConfig{}) {
		if runErr != nil {
			t.Fatal(runErr)
		}
	}
	loaded, err := service.Get(t.Context(), &session.GetRequest{AppName: AppName, UserID: "user", SessionID: "thread"})
	if err != nil {
		t.Fatal(err)
	}
	state := maps.Collect(loaded.Session.State().All())
	if state["status"] != StatusReady || state["generated_sql"] != generatedSQL {
		t.Fatalf("state = %#v", state)
	}
	insights, _ := state["insights"].(string)
	if !strings.Contains(insights, "Solar eclipse leads") || !strings.Contains(insights, "## Verification") || !strings.Contains(insights, "CONFIRMED") {
		t.Fatalf("insights = %q", insights)
	}
}
