package agui

import (
	"net/http/httptest"
	"testing"

	"agents/internal/agentruntime"
	aguievents "github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
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
	persisted := persistentSnapshot(agentruntime.StateMap(overlay))
	if _, leaked := persisted["temp:strava_token"]; leaked || persisted["strava_connected"] != true {
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

// TestStatePatchAddReplaceRemoveAndEscaping is the committed state-differ-
// level coverage the review asked for: an existing key changing value
// emits "replace"; a nil delta for an existing key emits "remove"; and a
// key containing "/" and "~" produces a correctly escaped RFC 6901 JSON
// Pointer path. The golden SSE fixture (testdata/agui/resume-events.jsonl)
// only exercises the "add" case, so these cases would otherwise never run.
func TestStatePatchAddReplaceRemoveAndEscaping(t *testing.T) {
	known := knownKeySet(map[string]any{"count": 1})

	t.Run("add with JSON Pointer escaping", func(t *testing.T) {
		patches := statePatch(known, map[string]any{"profile/name": "new", "a~b": true})
		if len(patches) != 2 {
			t.Fatalf("patches = %#v, want 2", patches)
		}
		byPath := map[string]aguievents.JSONPatchOperation{}
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
		if !known["profile/name"] || !known["a~b"] {
			t.Fatalf("known set not updated after add: %#v", known)
		}
	})

	t.Run("replace on existing key", func(t *testing.T) {
		patches := statePatch(known, map[string]any{"count": 2})
		if len(patches) != 1 {
			t.Fatalf("patches = %#v, want 1", patches)
		}
		if patches[0].Op != "replace" || patches[0].Path != "/count" || patches[0].Value != 2 {
			t.Fatalf("patch = %#v", patches[0])
		}
		if !known["count"] {
			t.Fatal("replace must not remove the key from known")
		}
	})

	t.Run("nil delta on existing key emits remove", func(t *testing.T) {
		patches := statePatch(known, map[string]any{"count": nil})
		if len(patches) != 1 {
			t.Fatalf("patches = %#v, want 1", patches)
		}
		if patches[0].Op != "remove" || patches[0].Path != "/count" {
			t.Fatalf("patch = %#v", patches[0])
		}
		if patches[0].Value != nil {
			t.Fatalf("remove op carried a value: %#v", patches[0].Value)
		}
		if known["count"] {
			t.Fatal("remove must delete the key from known")
		}
	})

	t.Run("nil delta on never-known key is a no-op", func(t *testing.T) {
		patches := statePatch(known, map[string]any{"never-known": nil})
		if len(patches) != 0 {
			t.Fatalf("patches = %#v, want none", patches)
		}
	})

	t.Run("temp: keys are always excluded", func(t *testing.T) {
		patches := statePatch(known, map[string]any{"temp:token": "secret"})
		if len(patches) != 0 {
			t.Fatalf("patches = %#v, want none", patches)
		}
	})

	t.Run("empty delta short-circuits", func(t *testing.T) {
		if patches := statePatch(known, nil); patches != nil {
			t.Fatalf("patches = %#v, want nil", patches)
		}
	})
}

func TestStreamedExpenseReportStateField(t *testing.T) {
	patches := statePatch(map[string]bool{}, map[string]any{"expense_report": "## Review\n- pending"})
	if len(patches) != 1 || patches[0].Op != "add" || patches[0].Path != "/expense_report" || patches[0].Value != "## Review\n- pending" {
		t.Fatalf("patches = %#v", patches)
	}
}
