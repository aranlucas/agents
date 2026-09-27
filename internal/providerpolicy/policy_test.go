package providerpolicy

import (
	"reflect"
	"strings"
	"testing"

	"github.com/aranlucas/agents/internal/config"
)

func TestAgentPolicies(t *testing.T) {
	t.Parallel()
	tests := []struct {
		workload  Workload
		provider  string
		model     string
		reasoning string
		rpm       int
		fallbacks []string
	}{
		{Expense, "openrouter", openRouterFreeModel, "", 20, []string{"groq"}},
		{Fitness, "groq", groqResponsesModel, "", 30, []string{"openrouter"}},
		{Grocery, "groq", groqResponsesModel, "", 20, []string{"openrouter"}},
		{Presentation, "groq", groqResponsesModel, "", 30, []string{"openrouter"}},
		{Research, "openrouter", openRouterFreeModel, "", 20, []string{"groq"}},
		{Career, "openrouter", openRouterFreeModel, "", 20, []string{"groq"}},
		{Spreadsheet, "groq", groqResponsesModel, "", 30, []string{"openrouter"}},
		{Travel, "openrouter", openRouterFreeModel, "", 20, []string{"groq"}},
		{Trends, "groq", groqResponsesModel, "", 30, []string{"openrouter"}},
		{Wellness, "groq", groqResponsesModel, "", 30, []string{"openrouter"}},
	}
	for _, test := range tests {
		t.Run(string(test.workload), func(t *testing.T) {
			t.Parallel()
			policy, err := Agent(test.workload)
			if err != nil {
				t.Fatal(err)
			}
			if policy.Provider != test.provider || policy.Model != test.model || policy.ReasoningEffort != test.reasoning || policy.RequestsPerMinute != test.rpm || !reflect.DeepEqual(policy.Fallbacks, test.fallbacks) {
				t.Fatalf("Agent(%q) = %#v", test.workload, policy)
			}
		})
	}
	if _, err := Agent("unknown"); err == nil {
		t.Fatal("unknown workload accepted")
	}
}

func TestResolveRequiredFiltersFallbacksAndPreservesOrder(t *testing.T) {
	t.Parallel()
	policy, err := Agent(Presentation)
	if err != nil {
		t.Fatal(err)
	}
	providers := map[string]config.Provider{
		"groq":       testProvider("groq"),
		"openrouter": testProvider("openrouter"),
	}
	resolved, err := ResolveRequired(providers, policy)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Model != groqResponsesModel || resolved.RequestsPerMinute != 30 {
		t.Fatalf("resolved policy = %#v", resolved)
	}
	if want := []string{"openrouter"}; !reflect.DeepEqual(resolved.Fallbacks, want) {
		t.Fatalf("fallbacks = %v, want %v", resolved.Fallbacks, want)
	}
	if providers["groq"].Model != "" || providers["groq"].Fallbacks != nil {
		t.Fatalf("input provider mutated: %#v", providers["groq"])
	}
	delete(providers, "groq")
	if _, err := ResolveRequired(providers, policy); err == nil || err.Error() != "GROQ_API_KEY is required to configure the presentation agent" {
		t.Fatalf("missing-provider error = %v", err)
	}
}

func TestFallbackProvidersPreservesProductionFallbackModels(t *testing.T) {
	t.Parallel()
	providers := map[string]config.Provider{
		"groq":       testProvider("groq"),
		"openrouter": testProvider("openrouter"),
		"nvidia":     testProvider("nvidia"),
	}
	configured := FallbackProviders(providers)
	wants := map[string]struct {
		model string
		rpm   int
	}{
		"groq":       {groqResponsesModel, 30},
		"openrouter": {openRouterFreeModel, 20},
		"nvidia":     {"", 0},
	}
	for name, want := range wants {
		got := configured[name]
		if got.Model != want.model || got.RequestsPerMinute != want.rpm {
			t.Fatalf("FallbackProviders()[%q] = %#v", name, got)
		}
	}
	if providers["groq"].Model != "" {
		t.Fatalf("input map mutated: %#v", providers["groq"])
	}
}

func TestResolveEvalPreservesSubstitutionOrderAndLimits(t *testing.T) {
	t.Parallel()
	policy, err := Agent(Fitness)
	if err != nil {
		t.Fatal(err)
	}
	providers := map[string]config.Provider{
		"openrouter": testProvider("openrouter"),
	}
	resolved, note, err := ResolveEval(providers, policy)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Name != "openrouter" || resolved.Model != openRouterFreeModel || resolved.RequestsPerMinute != 30 {
		t.Fatalf("substitution = %#v", resolved)
	}
	if note != "groq unavailable locally; substituted openrouter/openrouter/free for eval" {
		t.Fatalf("note = %q", note)
	}

	providers["groq"] = testProvider("groq")
	resolved, note, err = ResolveEval(providers, policy)
	if err != nil || note != "" || resolved.Name != "groq" || resolved.Model != policy.Model {
		t.Fatalf("preferred resolution = %#v, %q, %v", resolved, note, err)
	}

	if _, _, err := ResolveEval(nil, policy); err == nil || !strings.Contains(err.Error(), "no provider available") {
		t.Fatalf("empty-provider error = %v", err)
	}

	delete(providers, "openrouter")
	delete(providers, "groq")
	careerPolicy, err := Agent(Career)
	if err != nil {
		t.Fatal(err)
	}
	providers["groq"] = testProvider("groq")
	resolved, note, err = ResolveEval(providers, careerPolicy)
	if err != nil || note != "openrouter unavailable locally; substituted groq/openai/gpt-oss-120b for eval" || resolved.Name != "groq" || resolved.Model != groqResponsesModel {
		t.Fatalf("Groq eval resolution = %#v, %q, %v", resolved, note, err)
	}
}

func TestOralBoardsAndTelegramPoliciesStayDistinct(t *testing.T) {
	t.Parallel()
	gateway := GatewayOralBoards()
	if gateway.GeminiModel != "gemini-3.1-flash-lite" || gateway.Questioner.Provider != "" || gateway.Evaluator.Provider != "" || gateway.Scorer.Provider != "" || gateway.AllowQuestionerCaseBuilderFallback {
		t.Fatalf("gateway oralboards policy = %#v", gateway)
	}
	eval := EvalOralBoards()
	if eval.Questioner.Provider != "openrouter" || eval.Evaluator.Provider != "groq" || eval.Evaluator.Model != groqResponsesModel || eval.Scorer.Provider != "groq" || eval.Scorer.Model != groqResponsesModel || !eval.AllowQuestionerCaseBuilderFallback {
		t.Fatalf("eval oralboards policy = %#v", eval)
	}
	telegram := Telegram()
	if telegram.Provider != "groq" || telegram.Model != groqResponsesModel || telegram.RequestsPerMinute != 20 || len(telegram.Fallbacks) != 0 {
		t.Fatalf("telegram policy = %#v", telegram)
	}
}

func testProvider(name string) config.Provider {
	return config.Provider{Name: name, BaseURL: "https://" + name + ".example/v1", APIKey: "key"}
}
