package agui

import (
	"testing"

	aguievents "github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
)

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
