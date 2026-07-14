package providerpolicy

import (
	"reflect"
	"strings"
	"testing"

	"agents/internal/config"
)

func TestAgentPolicies(t *testing.T) {
	t.Parallel()
	tests := []struct {
		workload  Workload
		provider  string
		model     string
		rpm       int
		fallbacks []string
	}{
		{Expense, "openrouter", "tencent/hy3:free", 20, []string{"mistral"}},
		{Fitness, "groq", "llama-3.3-70b-versatile", 30, []string{"mistral", "openrouter"}},
		{Grocery, "nvidia", "nvidia/nemotron-3-super-120b-a12b", 20, []string{"mistral", "openrouter"}},
		{Presentation, "groq", "llama-3.3-70b-versatile", 30, []string{"mistral", "openrouter"}},
		{Research, "openrouter", "tencent/hy3:free", 20, []string{"mistral"}},
		{Resume, "openrouter", "google/gemma-4-26b-a4b-it:free", 20, nil},
		{Spreadsheet, "groq", "llama-3.3-70b-versatile", 30, []string{"mistral", "openrouter"}},
		{Travel, "openrouter", "tencent/hy3:free", 20, []string{"mistral"}},
		{Trends, "groq", "llama-3.3-70b-versatile", 30, []string{"mistral", "openrouter"}},
		{Wellness, "groq", "llama-3.3-70b-versatile", 30, []string{"mistral", "openrouter"}},
	}
	for _, test := range tests {
		test := test
		t.Run(string(test.workload), func(t *testing.T) {
			t.Parallel()
			policy, err := Agent(test.workload)
			if err != nil {
				t.Fatal(err)
			}
			if policy.Provider != test.provider || policy.Model != test.model || policy.RequestsPerMinute != test.rpm || !reflect.DeepEqual(policy.Fallbacks, test.fallbacks) {
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
	if resolved.Model != "llama-3.3-70b-versatile" || resolved.RequestsPerMinute != 30 {
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
		"mistral":    testProvider("mistral"),
		"groq":       testProvider("groq"),
		"openrouter": testProvider("openrouter"),
		"nvidia":     testProvider("nvidia"),
	}
	configured := FallbackProviders(providers)
	wants := map[string]struct {
		model string
		rpm   int
	}{
		"mistral":    {"mistral-small-latest", 20},
		"groq":       {"llama-3.3-70b-versatile", 30},
		"openrouter": {"tencent/hy3:free", 20},
		"nvidia":     {"", 0},
	}
	for name, want := range wants {
		got := configured[name]
		if got.Model != want.model || got.RequestsPerMinute != want.rpm {
			t.Fatalf("FallbackProviders()[%q] = %#v", name, got)
		}
	}
	if providers["mistral"].Model != "" {
		t.Fatalf("input map mutated: %#v", providers["mistral"])
	}
}

func TestResolveEvalPreservesSubstitutionOrderAndLimits(t *testing.T) {
	t.Parallel()
	policy, err := Agent(Fitness)
	if err != nil {
		t.Fatal(err)
	}
	providers := map[string]config.Provider{
		"mistral":    testProvider("mistral"),
		"openrouter": testProvider("openrouter"),
	}
	resolved, note, err := ResolveEval(providers, policy)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Name != "openrouter" || resolved.Model != "tencent/hy3:free" || resolved.RequestsPerMinute != 30 {
		t.Fatalf("substitution = %#v", resolved)
	}
	if note != "groq unavailable locally; substituted openrouter/tencent/hy3:free for eval" {
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
}

func TestOralBoardsAndTelegramPoliciesStayDistinct(t *testing.T) {
	t.Parallel()
	gateway := GatewayOralBoards()
	if gateway.GeminiModel != "gemini-3.1-flash-lite" || gateway.Questioner.Provider != "openrouter" || gateway.Evaluator.Model != "mistral-large-latest" || gateway.Scorer.Provider != "" || gateway.AllowQuestionerCaseBuilderFallback {
		t.Fatalf("gateway oralboards policy = %#v", gateway)
	}
	eval := EvalOralBoards()
	if eval.Scorer.Provider != "mistral" || eval.Scorer.Model != "mistral-medium-latest" || !eval.AllowQuestionerCaseBuilderFallback {
		t.Fatalf("eval oralboards policy = %#v", eval)
	}
	telegram := Telegram()
	if telegram.Provider != "mistral" || telegram.Model != "mistral-medium-latest" || telegram.RequestsPerMinute != 20 || len(telegram.Fallbacks) != 0 {
		t.Fatalf("telegram policy = %#v", telegram)
	}
}

func testProvider(name string) config.Provider {
	return config.Provider{Name: name, BaseURL: "https://" + name + ".example/v1", APIKey: "key"}
}
