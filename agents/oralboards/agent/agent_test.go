package oralboards

import (
	"context"
	"iter"
	"path/filepath"
	"testing"

	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

type fakeModel struct{ name string }

func (m fakeModel) Name() string { return m.name }
func (m fakeModel) GenerateContent(context.Context, *model.LLMRequest, bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		yield(&model.LLMResponse{Content: genai.NewContentFromText("done", genai.RoleModel), TurnComplete: true}, nil)
	}
}

func TestAgentExposesFourDeterministicPhaseChildren(t *testing.T) {
	corpus, err := OpenCorpus(filepath.Join("..", "..", "assets", "oralboards", "search.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = corpus.Close() })
	models := PhaseModels{CaseBuilder: fakeModel{"case"}, Questioner: fakeModel{"question"}, Evaluator: fakeModel{"evaluate"}, Scorer: fakeModel{"score"}}
	built, err := New(models, corpus)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"case_builder", "questioner", "evaluator", "scorer"}
	children := built.SubAgents()
	if len(children) != len(want) {
		t.Fatalf("children=%#v", children)
	}
	for index, name := range want {
		if children[index].Name() != name {
			t.Fatalf("child %d=%q", index, children[index].Name())
		}
	}
}

func TestStateDefaultsUseNonNilCollections(t *testing.T) {
	defaults := StateDefaults()
	for _, key := range []string{"case_sources", "transcript", "score_summary"} {
		if defaults[key] == nil {
			t.Fatalf("%s default is nil", key)
		}
	}
}
