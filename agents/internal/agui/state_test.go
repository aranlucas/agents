package agui

import (
	"encoding/json"
	"fmt"
	"iter"
	"net/http/httptest"
	"testing"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	"google.golang.org/adk/v2/session"
)

func TestOAuthHeadersBecomeRouteScopedFlagsWithoutChangingTokenNames(t *testing.T) {
	request := httptest.NewRequest("POST", "/fitness/agui", nil)
	request.Header.Set("X-Strava-Access-Token", "strava-secret")
	overlay := requestStateOverlay(request, "fitness")
	if overlay["temp:strava_token"] != "strava-secret" || overlay["strava_connected"] != true {
		t.Fatalf("overlay = %#v", overlay)
	}
	if _, exists := overlay["kroger_connected"]; exists {
		t.Fatalf("fitness overlay included grocery flag: %#v", overlay)
	}

	disconnected := requestStateOverlay(httptest.NewRequest("POST", "/fitness/agui", nil), "fitness")
	if disconnected["strava_connected"] != false {
		t.Fatalf("disconnected overlay = %#v", disconnected)
	}
	persisted, err := persistentSnapshot(testState(overlay))
	if err != nil {
		t.Fatal(err)
	}
	if _, leaked := persisted["temp:strava_token"]; leaked || string(persisted["strava_connected"]) != "true" {
		t.Fatalf("persistent snapshot = %#v", persisted)
	}

	groceryRequest := httptest.NewRequest("POST", "/grocery/agui", nil)
	groceryRequest.Header.Set("X-Kroger-Access-Token", "kroger-secret")
	grocery := requestStateOverlay(groceryRequest, "grocery")
	if grocery["temp:kroger_token"] != "kroger-secret" || grocery["kroger_connected"] != true {
		t.Fatalf("grocery overlay = %#v", grocery)
	}
	if _, exists := grocery["strava_connected"]; exists {
		t.Fatalf("grocery overlay included fitness flag: %#v", grocery)
	}

	wellnessRequest := httptest.NewRequest("POST", "/wellness/agui", nil)
	wellnessRequest.Header.Set("X-Kroger-Access-Token", "kroger-secret")
	wellness := requestStateOverlay(wellnessRequest, "wellness")
	if wellness["temp:kroger_token"] != "kroger-secret" || wellness["kroger_connected"] != true {
		t.Fatalf("wellness overlay = %#v", wellness)
	}
	if wellness["strava_connected"] != false {
		t.Fatalf("wellness overlay should mark absent strava as disconnected: %#v", wellness)
	}
}

type testState map[string]any

func (s testState) Get(key string) (any, error) {
	value, ok := s[key]
	if !ok {
		return nil, session.ErrStateKeyNotExist
	}
	return value, nil
}

func (s testState) All() iter.Seq2[string, any] {
	return func(yield func(string, any) bool) {
		for key, value := range s {
			if !yield(key, value) {
				return
			}
		}
	}
}

func TestPersistentSnapshotValidatesValuesAndOmitsTypedNil(t *testing.T) {
	var deleted *string
	snapshot, err := persistentSnapshot(testState{"present": "value", "deleted": deleted})
	if err != nil {
		t.Fatal(err)
	}
	if string(snapshot["present"]) != `"value"` {
		t.Fatalf("snapshot = %#v", snapshot)
	}
	if _, ok := snapshot["deleted"]; ok {
		t.Fatalf("typed nil leaked into snapshot: %#v", snapshot)
	}
	if _, err := persistentSnapshot(testState{"invalid": make(chan int)}); err == nil {
		t.Fatal("non-JSON state value was accepted")
	}
}

func TestStatePatchAddReplaceRemoveAndEscaping(t *testing.T) {
	state := stateDocument{"count": json.RawMessage("1")}

	t.Run("add with JSON Pointer escaping", func(t *testing.T) {
		patches, err := statePatch(state, map[string]any{"profile/name": "new", "a~b": true})
		if err != nil {
			t.Fatal(err)
		}
		if len(patches) != 2 {
			t.Fatalf("patches = %#v, want 2", patches)
		}
		byPath := map[string]events.JSONPatchOperation{}
		for _, p := range patches {
			byPath[p.Path] = p
		}
		nameOp, ok := byPath["/profile~1name"]
		if !ok || nameOp.Op != "add" || nameOp.Value != "new" {
			t.Fatalf("profile/name op = %#v", nameOp)
		}
		tildeOp, ok := byPath["/a~0b"]
		if !ok || tildeOp.Op != "add" || tildeOp.Value != true {
			t.Fatalf("a~b op = %#v", tildeOp)
		}
		if string(state["profile/name"]) != `"new"` || string(state["a~b"]) != "true" {
			t.Fatalf("state not updated after add: %#v", state)
		}
	})

	t.Run("replace on existing key", func(t *testing.T) {
		patches, err := statePatch(state, map[string]any{"count": 2})
		if err != nil {
			t.Fatal(err)
		}
		if len(patches) != 1 {
			t.Fatalf("patches = %#v, want 1", patches)
		}
		if patches[0].Op != "replace" || patches[0].Path != "/count" || fmt.Sprint(patches[0].Value) != "2" {
			t.Fatalf("patch = %#v", patches[0])
		}
		if string(state["count"]) != "2" {
			t.Fatalf("replace did not update state: %#v", state)
		}
	})

	t.Run("typed nil delta also emits remove", func(t *testing.T) {
		state["typed-nil"] = json.RawMessage(`"present"`)
		var deleted *string
		patches, err := statePatch(state, map[string]any{"typed-nil": deleted})
		if err != nil {
			t.Fatal(err)
		}
		if len(patches) != 1 || patches[0].Op != "remove" || patches[0].Path != "/typed-nil" {
			t.Fatalf("patches = %#v", patches)
		}
		if _, ok := state["typed-nil"]; ok {
			t.Fatalf("typed nil did not delete state key: %#v", state)
		}
	})

	t.Run("nil delta on existing key emits remove", func(t *testing.T) {
		patches, err := statePatch(state, map[string]any{"count": nil})
		if err != nil {
			t.Fatal(err)
		}
		if len(patches) != 1 {
			t.Fatalf("patches = %#v, want 1", patches)
		}
		if patches[0].Op != "remove" || patches[0].Path != "/count" {
			t.Fatalf("patch = %#v", patches[0])
		}
		if patches[0].Value != nil {
			t.Fatalf("remove op carried a value: %#v", patches[0].Value)
		}
		if _, ok := state["count"]; ok {
			t.Fatalf("remove did not delete state key: %#v", state)
		}
	})

	t.Run("nil delta on never-known key is a no-op", func(t *testing.T) {
		patches, err := statePatch(state, map[string]any{"never-known": nil})
		if err != nil {
			t.Fatal(err)
		}
		if len(patches) != 0 {
			t.Fatalf("patches = %#v, want none", patches)
		}
	})

	t.Run("temp: keys are always excluded", func(t *testing.T) {
		patches, err := statePatch(state, map[string]any{"temp:token": "secret"})
		if err != nil {
			t.Fatal(err)
		}
		if len(patches) != 0 {
			t.Fatalf("patches = %#v, want none", patches)
		}
	})

	t.Run("empty delta short-circuits", func(t *testing.T) {
		patches, err := statePatch(state, nil)
		if err != nil {
			t.Fatal(err)
		}
		if patches != nil {
			t.Fatalf("patches = %#v, want nil", patches)
		}
	})
}

func TestStreamedExpenseReportStateField(t *testing.T) {
	patches, err := statePatch(stateDocument{}, map[string]any{"expense_report": "## Review\n- pending"})
	if err != nil {
		t.Fatal(err)
	}
	if len(patches) != 1 || patches[0].Op != "add" || patches[0].Path != "/expense_report" || patches[0].Value != "## Review\n- pending" {
		t.Fatalf("patches = %#v", patches)
	}
}
