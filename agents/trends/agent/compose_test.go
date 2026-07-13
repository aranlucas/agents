package trends

import (
	"context"
	"encoding/json"
	"errors"
	"iter"
	"strings"
	"testing"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

// fakeComposerModel is a scripted model.LLM double for composeA2UI tests:
// no real Gemini API call is made, matching the repo convention of driving
// model.LLM-typed collaborators with a local fake (see fakeModel /
// scriptedModel in agent_test.go).
type fakeComposerModel struct {
	text string
	err  error
}

func (fakeComposerModel) Name() string { return "fake-composer" }
func (m fakeComposerModel) GenerateContent(context.Context, *model.LLMRequest, bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		if m.err != nil {
			yield(nil, m.err)
			return
		}
		yield(&model.LLMResponse{Content: genai.NewContentFromText(m.text, genai.RoleModel), TurnComplete: true}, nil)
	}
}

func sampleTrendsResult() TrendsResult {
	return TrendsResult{
		Query:   "top terms this week",
		SQL:     "SELECT term, rank FROM `bigquery-public-data.google_trends.top_terms` LIMIT 10",
		Columns: []string{"term", "rank"},
		Rows: []Row{
			{"term": "solar eclipse", "rank": int64(1)},
			{"term": "world cup", "rank": int64(2)},
		},
		Insights: "Solar eclipse leads this week's results.",
	}
}

func TestComposeA2UINilComposerFallsBackDeterministically(t *testing.T) {
	event := composeA2UI(t.Context(), nil, sampleTrendsResult())
	assertDeterministicFallback(t, event)
}

func TestComposeA2UIFallsBackWhenComposerCallFails(t *testing.T) {
	composer := fakeComposerModel{err: errors.New("provider unavailable")}
	event := composeA2UI(t.Context(), composer, sampleTrendsResult())
	assertDeterministicFallback(t, event)
}

func TestComposeA2UIFallsBackWhenCompositionIsUnparseable(t *testing.T) {
	composer := fakeComposerModel{text: "not json at all"}
	event := composeA2UI(t.Context(), composer, sampleTrendsResult())
	assertDeterministicFallback(t, event)
}

func TestComposeA2UIFallsBackWhenCompositionReferencesUnknownColumn(t *testing.T) {
	composer := fakeComposerModel{text: `{"components":[{"component":"TrendBarChart","title":"Top terms","categoryKey":"term","valueKey":"percent_gain"}]}`}
	event := composeA2UI(t.Context(), composer, sampleTrendsResult())
	assertDeterministicFallback(t, event)
}

func TestComposeA2UIFallsBackWhenCompositionUsesDisallowedComponent(t *testing.T) {
	composer := fakeComposerModel{text: `{"components":[{"component":"SqlDisclosure","title":"nope","sql":"DROP TABLE x"}]}`}
	event := composeA2UI(t.Context(), composer, sampleTrendsResult())
	assertDeterministicFallback(t, event)
}

func TestComposeA2UIFallsBackWhenCompositionExceedsComponentCap(t *testing.T) {
	composer := fakeComposerModel{text: `{"components":[
		{"component":"TrendTable","title":"a"},
		{"component":"TrendTable","title":"b"},
		{"component":"TrendTable","title":"c"},
		{"component":"TrendTable","title":"d"}
	]}`}
	event := composeA2UI(t.Context(), composer, sampleTrendsResult())
	assertDeterministicFallback(t, event)
}

func TestComposeA2UIUsesLLMCompositionWhenValid(t *testing.T) {
	composer := fakeComposerModel{text: "```json\n" + `{"components":[{"component":"TrendBarChart","title":"Top terms by rank","description":"Ranked search terms","categoryKey":"term","valueKey":"rank","maxItems":5,"valueFormat":"number"}]}` + "\n```"}
	event := composeA2UI(t.Context(), composer, sampleTrendsResult())

	encoded, err := json.Marshal(event)
	if err != nil {
		t.Fatal(err)
	}
	body := string(encoded)
	if !strings.Contains(body, "TrendBarChart") {
		t.Fatalf("expected LLM-composed TrendBarChart, got: %s", body)
	}
	if !strings.Contains(body, "categoryKey") || !strings.Contains(body, "\"term\"") {
		t.Fatalf("composed component missing injected column keys: %s", body)
	}
	if !strings.Contains(body, "SqlDisclosure") || !strings.Contains(body, trendsCatalogID) {
		t.Fatalf("composed surface must still include SqlDisclosure and the catalog id: %s", body)
	}
	if strings.Contains(body, "\"TrendTable\"") {
		t.Fatalf("expected the LLM composition to replace the deterministic TrendTable, got: %s", body)
	}
}

func TestComposeA2UISkipsComposerWhenResultHasNoRows(t *testing.T) {
	composer := fakeComposerModel{text: `{"components":[{"component":"TrendTable"}]}`}
	result := sampleTrendsResult()
	result.Rows = nil
	event := composeA2UI(t.Context(), composer, result)
	assertDeterministicFallback(t, event)
}

func assertDeterministicFallback(t *testing.T, event *events.ActivitySnapshotEvent) {
	t.Helper()
	encoded, err := json.Marshal(event)
	if err != nil {
		t.Fatal(err)
	}
	body := string(encoded)
	if !strings.Contains(body, "\"TrendTable\"") || !strings.Contains(body, "SqlDisclosure") || !strings.Contains(body, trendsCatalogID) {
		t.Fatalf("expected deterministic TrendTable+SqlDisclosure fallback, got: %s", body)
	}
}
