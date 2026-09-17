package agui

import (
	json "encoding/json/v2"
	"testing"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
)

func assertAGUISequence(t *testing.T, frames []any) {
	t.Helper()
	decoded := make([]events.Event, 0, len(frames))
	for _, frame := range frames {
		encoded, err := json.Marshal(frame)
		if err != nil {
			t.Fatal(err)
		}
		event, err := events.EventFromJSON(encoded)
		if err != nil {
			t.Fatal(err)
		}
		decoded = append(decoded, event)
	}
	if err := events.ValidateSequence(decoded); err != nil {
		t.Fatal(err)
	}
}
