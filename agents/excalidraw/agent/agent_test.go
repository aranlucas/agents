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

func TestInstructionRequiresCurrentMCPAppsElementSyntax(t *testing.T) {
	for _, required := range []string{
		"always call `read_me` and wait",
		"Never call `read_me` and `create_view` in parallel",
		`"label":{"text":"Frontend","fontSize":16}`,
		"never the unsupported `fillColor`",
		"`startBinding`",
		"`endBinding`",
		"Never use an unsupported",
		"`target` field for arrows",
		"New scenes must start with a supported 4:3 `cameraUpdate`",
		"Modifications must start with `restoreCheckpoint`, followed by a supported",
		"4:3 `cameraUpdate` before the changed elements",
	} {
		if !strings.Contains(Instruction, required) {
			t.Errorf("instruction does not contain %q", required)
		}
	}
	if strings.Contains(Instruction, "when you need the server's current syntax guidance") {
		t.Fatal("read_me must be mandatory before the first create_view")
	}
}
