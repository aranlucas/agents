package agui

import (
	json "encoding/json/v2"
	"errors"
	"fmt"
	"testing"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
)

func assertStrictAGUISequence(t *testing.T, frames []any) {
	t.Helper()
	if err := validateStrictAGUISequence(frames); err != nil {
		t.Fatal(err)
	}
}

// validateStrictAGUISequence mirrors the default TypeScript verifier's lane
// ownership checks, then applies this gateway's one-run-per-response rule: a
// RUN_ERROR or RUN_FINISHED terminal must be the final frame. Reasoning lanes
// are checked too even though older clients did not include them.
func validateStrictAGUISequence(frames []any) error {
	if len(frames) == 0 {
		return errors.New("AG-UI stream is empty")
	}
	guard := newSequenceGuard()

	for index, frame := range frames {
		object, ok := frame.(map[string]any)
		if !ok {
			return fmt.Errorf("frame %d is not an object", index)
		}
		encoded, err := json.Marshal(object)
		if err != nil {
			return fmt.Errorf("encode frame %d: %w", index, err)
		}
		event, err := events.EventFromJSON(encoded)
		if err != nil || event.Validate() != nil {
			return fmt.Errorf("frame %d is not schema-valid", index)
		}
		if err := guard.admit(encoded); err != nil {
			return fmt.Errorf("frame %d violates AG-UI sequence: %w", index, err)
		}
		if guard.terminal && index != len(frames)-1 {
			return fmt.Errorf("terminal %s at frame %d is followed by another event", event.Type(), index)
		}
	}
	if !guard.terminal {
		return errors.New("AG-UI stream has no terminal final frame")
	}
	return nil
}

func TestStrictSequenceRejectsEventsAfterEitherTerminal(t *testing.T) {
	for _, terminal := range []string{"RUN_ERROR", "RUN_FINISHED"} {
		frames := []any{
			map[string]any{"type": "RUN_STARTED", "threadId": "thread", "runId": "run"},
			map[string]any{"type": terminal, "threadId": "thread", "runId": "run", "message": "failed"},
			map[string]any{"type": "STATE_SNAPSHOT", "snapshot": map[string]any{}},
		}
		if err := validateStrictAGUISequence(frames); err == nil {
			t.Fatalf("%s followed by state was accepted", terminal)
		}
	}
}

func TestStrictSequenceRejectsSuccessfulCompletionWithOpenReasoning(t *testing.T) {
	frames := []any{
		map[string]any{"type": "RUN_STARTED", "threadId": "thread", "runId": "run"},
		map[string]any{"type": "REASONING_START", "messageId": "reasoning"},
		map[string]any{"type": "REASONING_MESSAGE_START", "messageId": "reasoning", "role": "reasoning"},
		map[string]any{"type": "RUN_FINISHED", "threadId": "thread", "runId": "run"},
	}
	if err := validateStrictAGUISequence(frames); err == nil {
		t.Fatal("RUN_FINISHED with open reasoning was accepted")
	}
}
