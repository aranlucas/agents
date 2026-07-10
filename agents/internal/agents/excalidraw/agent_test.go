package excalidraw

import (
	"context"
	"iter"
	"strings"
	"testing"

	"google.golang.org/adk/v2/model"
)

type fakeModel struct{}

func (fakeModel) Name() string { return "fake" }
func (fakeModel) GenerateContent(context.Context, *model.LLMRequest, bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) { yield(&model.LLMResponse{TurnComplete: true}, nil) }
}

func TestAgentEmbedsMCPAppsInstructionsAndTypedDefaults(t *testing.T) {
	built, err := New(fakeModel{})
	if err != nil || built.Name() != AppName {
		t.Fatalf("agent=%v err=%v", built, err)
	}
	if !strings.Contains(Instruction, "Never paste scene JSON") {
		t.Fatal("missing Excalidraw output safety instruction")
	}
	if got := StateDefaults()["user_id"]; got != "" {
		t.Fatalf("user_id default = %#v", got)
	}
}
