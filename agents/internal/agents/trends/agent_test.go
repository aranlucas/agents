package trends

import (
	"context"
	"encoding/json"
	"iter"
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
	if _, err := New(fakeModel{}, nil, nil, nil, nil); err == nil {
		t.Fatal("New(nil generator) succeeded unexpectedly")
	}
	otherAgent, err := agent.New(agent.Config{Name: "not_the_generator"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := New(fakeModel{}, otherAgent, nil, nil, nil); err == nil {
		t.Fatal("New(wrong-named generator) succeeded unexpectedly")
	}
	generator, err := NewGenerator(fakeModel{})
	if err != nil {
		t.Fatal(err)
	}
	built, err := New(fakeModel{}, generator, nil, nil, nil)
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
	if !strings.Contains(GeneratorInstruction, "top_terms") || !strings.Contains(GeneratorInstruction, "MAX(refresh_date)") {
		t.Fatalf("generator instruction missing table structure / few-shot content")
	}
}

func TestInstructionOrdersStepsAndCoversVerification(t *testing.T) {
	for _, want := range []string{"TrendsQueryGeneratorAgent", "validate_trends_sql", "begin_trends_query", "execute_bigquery_sql", "write_trends_result", "set_trends_verification", "generate_a2ui", "Brave", "CONFIRMED", "CONTRADICTED", "UNVERIFIED"} {
		if !strings.Contains(Instruction, want) {
			t.Fatalf("instruction missing %q", want)
		}
	}
	if strings.Index(Instruction, "TrendsQueryGeneratorAgent") > strings.Index(Instruction, "validate_trends_sql") {
		t.Fatal("instruction must generate SQL before validating it")
	}
	if strings.Index(Instruction, "write_trends_result") > strings.Index(Instruction, "generate_a2ui") {
		t.Fatal("instruction must persist the result before rendering A2UI")
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
}

func TestExecuteSQLToolReportsUnconfiguredBigQueryWithoutPanicking(t *testing.T) {
	result, err := executeSQLTool(nil)(nil, ExecuteSQLArgs{SQL: "SELECT 1 LIMIT 10"})
	if err != nil || result.OK || result.Error == nil || result.Error.Code != "bigquery_not_configured" {
		t.Fatalf("result = %#v, err = %v", result, err)
	}
}

// scriptedModel replays a fixed sequence of responses per GenerateContent
// call, matching the pattern already used by internal/agents/wellness's
// agent_test.go for driving a real ADK runner end to end.
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

// TestTrendsAgentPipelineWritesStateAndEmitsA2UI drives the full
// GoogleTrendsAgent (root + generator AgentTool) through a real ADK runner
// with scripted models, exercising the exact tool sequence instructions.md
// prescribes: generate SQL, validate, begin, persist the result, verify,
// then render A2UI. It asserts both the persisted TrendsState and that
// generate_a2ui emitted a temp:a2ui_activity: state delta carrying the
// trends catalog ID (the same mechanism internal/agui/converter.go turns
// into an ACTIVITY_SNAPSHOT event).
func TestTrendsAgentPipelineWritesStateAndEmitsA2UI(t *testing.T) {
	const generatedSQL = "SELECT term, rank FROM `bigquery-public-data.google_trends.top_terms` LIMIT 10"

	generatorModel := &scriptedModel{responses: []*model.LLMResponse{
		{Content: genai.NewContentFromText(generatedSQL, genai.RoleModel), TurnComplete: true},
	}}
	generator, err := NewGenerator(generatorModel)
	if err != nil {
		t.Fatal(err)
	}

	rootModel := &scriptedModel{responses: []*model.LLMResponse{
		functionCall("gen", GeneratorAppName, map[string]any{"request": "top terms in the US"}),
		functionCall("validate", "validate_trends_sql", map[string]any{"sql": generatedSQL}),
		functionCall("begin", "begin_trends_query", map[string]any{"query": "top terms in the US", "sql": generatedSQL}),
		functionCall("write", "write_trends_result", map[string]any{
			"query": "top terms in the US", "sql": generatedSQL,
			"columns":  []any{"term", "rank"},
			"rows":     []any{map[string]any{"term": "solar eclipse", "rank": int64(1)}},
			"insights": "Solar eclipse leads this week's results.",
		}),
		functionCall("verify", "set_trends_verification", map[string]any{"verification": "CONFIRMED: solar eclipse tracks a real event this week. High confidence."}),
		functionCall("render", "generate_a2ui", map[string]any{}),
		{Content: genai.NewContentFromText("Trends analysis ready.", genai.RoleModel), TurnComplete: true},
	}}
	built, err := New(rootModel, generator, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}

	service := preservesTempStateService{inner: session.InMemoryService()}
	if _, err := service.Create(t.Context(), &session.CreateRequest{AppName: AppName, UserID: "user", SessionID: "thread", State: StateDefaults()}); err != nil {
		t.Fatal(err)
	}
	run, err := runner.New(runner.Config{AppName: AppName, Agent: built, SessionService: service})
	if err != nil {
		t.Fatal(err)
	}

	var sawA2UIActivity bool
	for event, runErr := range run.Run(t.Context(), "user", "thread", genai.NewContentFromText("What's trending this week?", genai.RoleUser), agent.RunConfig{}) {
		if runErr != nil {
			t.Fatal(runErr)
		}
		for key, raw := range event.Actions.StateDelta {
			if !strings.HasPrefix(key, a2uiActivityStatePrefix) {
				continue
			}
			encoded, err := json.Marshal(raw)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(string(encoded), trendsCatalogID) {
				t.Fatalf("a2ui activity missing catalog id: %s", encoded)
			}
			sawA2UIActivity = true
		}
	}
	if !sawA2UIActivity {
		t.Fatal("generate_a2ui never emitted a temp:a2ui_activity: state delta")
	}

	loaded, err := service.Get(t.Context(), &session.GetRequest{AppName: AppName, UserID: "user", SessionID: "thread"})
	if err != nil {
		t.Fatal(err)
	}
	state := make(map[string]any)
	for key, value := range loaded.Session.State().All() {
		state[key] = value
	}
	if state["status"] != StatusReady {
		t.Fatalf("status = %v, want %q", state["status"], StatusReady)
	}
	if state["generated_sql"] != generatedSQL {
		t.Fatalf("generated_sql = %v", state["generated_sql"])
	}
	insights, _ := state["insights"].(string)
	if !strings.Contains(insights, "Solar eclipse leads") || !strings.Contains(insights, "## Verification") || !strings.Contains(insights, "CONFIRMED") {
		t.Fatalf("insights = %q", insights)
	}
}

// TestTrendsAgentPipelineUsesComposerWhenConfigured drives the same real
// ADK runner pipeline as TestTrendsAgentPipelineWritesStateAndEmitsA2UI, but
// wires a composer model.LLM into New (its new 5th parameter, see agent.go)
// that returns a valid Trends composition. It asserts the resulting
// temp:a2ui_activity: state delta carries the LLM-composed TrendBarChart
// rather than the deterministic-only TrendTable, proving generate_a2ui
// actually calls the composer inline on the root agent's own context
// (composeA2UI, see compose.go) rather than dropping it the way a
// Gemini-backed AgentTool sub-agent would (see the package doc).
func TestTrendsAgentPipelineUsesComposerWhenConfigured(t *testing.T) {
	const generatedSQL = "SELECT term, rank FROM `bigquery-public-data.google_trends.top_terms` LIMIT 10"

	generatorModel := &scriptedModel{responses: []*model.LLMResponse{
		{Content: genai.NewContentFromText(generatedSQL, genai.RoleModel), TurnComplete: true},
	}}
	generator, err := NewGenerator(generatorModel)
	if err != nil {
		t.Fatal(err)
	}

	rootModel := &scriptedModel{responses: []*model.LLMResponse{
		functionCall("gen", GeneratorAppName, map[string]any{"request": "top terms in the US"}),
		functionCall("validate", "validate_trends_sql", map[string]any{"sql": generatedSQL}),
		functionCall("begin", "begin_trends_query", map[string]any{"query": "top terms in the US", "sql": generatedSQL}),
		functionCall("write", "write_trends_result", map[string]any{
			"query": "top terms in the US", "sql": generatedSQL,
			"columns":  []any{"term", "rank"},
			"rows":     []any{map[string]any{"term": "solar eclipse", "rank": int64(1)}, map[string]any{"term": "world cup", "rank": int64(2)}},
			"insights": "Solar eclipse leads this week's results.",
		}),
		functionCall("verify", "set_trends_verification", map[string]any{"verification": "CONFIRMED: solar eclipse tracks a real event this week. High confidence."}),
		functionCall("render", "generate_a2ui", map[string]any{}),
		{Content: genai.NewContentFromText("Trends analysis ready.", genai.RoleModel), TurnComplete: true},
	}}
	composer := fakeComposerModel{text: `{"components":[{"component":"TrendBarChart","title":"Top terms by rank","categoryKey":"term","valueKey":"rank","valueFormat":"number"}]}`}
	built, err := New(rootModel, generator, nil, nil, composer)
	if err != nil {
		t.Fatal(err)
	}

	service := preservesTempStateService{inner: session.InMemoryService()}
	if _, err := service.Create(t.Context(), &session.CreateRequest{AppName: AppName, UserID: "user", SessionID: "thread", State: StateDefaults()}); err != nil {
		t.Fatal(err)
	}
	run, err := runner.New(runner.Config{AppName: AppName, Agent: built, SessionService: service})
	if err != nil {
		t.Fatal(err)
	}

	var composedActivity string
	for event, runErr := range run.Run(t.Context(), "user", "thread", genai.NewContentFromText("What's trending this week?", genai.RoleUser), agent.RunConfig{}) {
		if runErr != nil {
			t.Fatal(runErr)
		}
		for key, raw := range event.Actions.StateDelta {
			if !strings.HasPrefix(key, a2uiActivityStatePrefix) {
				continue
			}
			encoded, err := json.Marshal(raw)
			if err != nil {
				t.Fatal(err)
			}
			composedActivity = string(encoded)
		}
	}
	if composedActivity == "" {
		t.Fatal("generate_a2ui never emitted a temp:a2ui_activity: state delta")
	}
	if !strings.Contains(composedActivity, "TrendBarChart") {
		t.Fatalf("expected the composer's TrendBarChart to reach the state delta, got: %s", composedActivity)
	}
	if !strings.Contains(composedActivity, trendsCatalogID) || !strings.Contains(composedActivity, "SqlDisclosure") {
		t.Fatalf("composed activity must still be catalog-valid and include SqlDisclosure: %s", composedActivity)
	}
}

// preservesTempStateService wraps session.InMemoryService() to match
// internal/cloudflare.SessionService's AppendEvent contract instead of
// ADK-Go's built-in one. ADK-Go's session.Service.AppendEvent is documented
// to "remove temporary state keys from the event" (its own doc comment) —
// i.e. it strips temp: entries from event.Actions.StateDelta in place,
// which would make this test fail for reasons that have nothing to do with
// trends' own tool wiring: the runner yields that same *session.Event to
// its caller after AppendEvent returns, and both the MCP Apps bridge and
// generate_a2ui here depend on reading temp:*_activity: keys off of it (see
// internal/agui/converter.go's activityEvents). Production's
// internal/cloudflare.SessionService.AppendEvent was fixed to keep temp:
// keys out of D1 and out of session.State() without stripping them from the
// event itself (see its TestSessionAppendEventPreservesTemporaryStateOnTheEventItself);
// this wrapper reproduces that same contract over the in-memory service so
// the test exercises the real, fixed behavior rather than ADK-Go's stock
// one.
type preservesTempStateService struct{ inner session.Service }

func (s preservesTempStateService) Create(ctx context.Context, req *session.CreateRequest) (*session.CreateResponse, error) {
	return s.inner.Create(ctx, req)
}

func (s preservesTempStateService) Get(ctx context.Context, req *session.GetRequest) (*session.GetResponse, error) {
	return s.inner.Get(ctx, req)
}

func (s preservesTempStateService) List(ctx context.Context, req *session.ListRequest) (*session.ListResponse, error) {
	return s.inner.List(ctx, req)
}

func (s preservesTempStateService) Delete(ctx context.Context, req *session.DeleteRequest) error {
	return s.inner.Delete(ctx, req)
}

func (s preservesTempStateService) AppendEvent(ctx context.Context, sess session.Session, event *session.Event) error {
	original := make(map[string]any, len(event.Actions.StateDelta))
	for key, value := range event.Actions.StateDelta {
		original[key] = value
	}
	if err := s.inner.AppendEvent(ctx, sess, event); err != nil {
		return err
	}
	event.Actions.StateDelta = original
	return nil
}

var _ session.Service = preservesTempStateService{}
