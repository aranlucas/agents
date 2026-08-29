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
	activeText := make(map[string]bool)
	activeReasoning := make(map[string]bool)
	activeReasoningMessages := make(map[string]bool)
	activeTools := make(map[string]bool)
	activeSteps := make(map[string]bool)

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
		typeName := string(event.Type())
		if index == 0 && typeName != string(events.EventTypeRunStarted) && typeName != string(events.EventTypeRunError) {
			return errors.New("first AG-UI frame must be RUN_STARTED or RUN_ERROR")
		}
		if isTerminalEvent(event) && index != len(frames)-1 {
			return fmt.Errorf("terminal %s at frame %d is followed by another event", typeName, index)
		}

		switch event.Type() {
		case events.EventTypeTextMessageStart:
			id := stringField(object, "messageId")
			if activeText[id] {
				return fmt.Errorf("text message %q already active", id)
			}
			activeText[id] = true
		case events.EventTypeTextMessageContent:
			if id := stringField(object, "messageId"); !activeText[id] {
				return fmt.Errorf("text content has no active message %q", id)
			}
		case events.EventTypeTextMessageEnd:
			id := stringField(object, "messageId")
			if !activeText[id] {
				return fmt.Errorf("text end has no active message %q", id)
			}
			delete(activeText, id)
		case events.EventTypeReasoningStart:
			id := stringField(object, "messageId")
			if activeReasoning[id] {
				return fmt.Errorf("reasoning %q already active", id)
			}
			activeReasoning[id] = true
		case events.EventTypeReasoningMessageStart:
			id := stringField(object, "messageId")
			if activeReasoningMessages[id] {
				return fmt.Errorf("reasoning message %q already active", id)
			}
			activeReasoningMessages[id] = true
		case events.EventTypeReasoningMessageContent:
			if id := stringField(object, "messageId"); !activeReasoningMessages[id] {
				return fmt.Errorf("reasoning content has no active message %q", id)
			}
		case events.EventTypeReasoningMessageEnd:
			id := stringField(object, "messageId")
			if !activeReasoningMessages[id] {
				return fmt.Errorf("reasoning end has no active message %q", id)
			}
			delete(activeReasoningMessages, id)
		case events.EventTypeReasoningEnd:
			id := stringField(object, "messageId")
			if !activeReasoning[id] {
				return fmt.Errorf("reasoning end has no active lane %q", id)
			}
			delete(activeReasoning, id)
		case events.EventTypeToolCallStart:
			id := stringField(object, "toolCallId")
			if activeTools[id] {
				return fmt.Errorf("tool call %q already active", id)
			}
			activeTools[id] = true
		case events.EventTypeToolCallArgs:
			if id := stringField(object, "toolCallId"); !activeTools[id] {
				return fmt.Errorf("tool args have no active call %q", id)
			}
		case events.EventTypeToolCallEnd:
			id := stringField(object, "toolCallId")
			if !activeTools[id] {
				return fmt.Errorf("tool end has no active call %q", id)
			}
			delete(activeTools, id)
		case events.EventTypeStepStarted:
			name := stringField(object, "stepName")
			if activeSteps[name] {
				return fmt.Errorf("step %q already active", name)
			}
			activeSteps[name] = true
		case events.EventTypeStepFinished:
			name := stringField(object, "stepName")
			if !activeSteps[name] {
				return fmt.Errorf("step %q was not active", name)
			}
			delete(activeSteps, name)
		case events.EventTypeRunFinished:
			if len(activeText)+len(activeReasoning)+len(activeReasoningMessages)+len(activeTools)+len(activeSteps) != 0 {
				return errors.New("RUN_FINISHED has open protocol lanes")
			}
		}
	}
	last := frames[len(frames)-1].(map[string]any)
	lastType := stringField(last, "type")
	if lastType != string(events.EventTypeRunFinished) && lastType != string(events.EventTypeRunError) {
		return errors.New("AG-UI stream has no terminal final frame")
	}
	return nil
}

func stringField(object map[string]any, key string) string {
	value, _ := object[key].(string)
	return value
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
