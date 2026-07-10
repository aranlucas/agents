package agentruntime

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestTransactionEscapesPatchPathsAndOmitsTemporaryKeys(t *testing.T) {
	tx := NewTransaction(map[string]any{"profile/name": "old", "temp:token": "secret"})
	tx.Set("profile/name", "new")
	tx.Set("a~b", true)
	tx.Set("temp:other", "hidden")
	patch := tx.Patch()
	if len(patch) != 2 || patch[0].Path != "/profile~1name" || patch[0].Op != "replace" || patch[1].Path != "/a~0b" {
		t.Fatalf("patch = %#v", patch)
	}
	data, _ := json.Marshal(tx.PersistentSnapshot())
	if strings.Contains(string(data), "secret") || strings.Contains(string(data), "hidden") {
		t.Fatalf("temporary state persisted: %s", data)
	}
	changes, _ := json.Marshal(tx.Changes())
	if strings.Contains(string(changes), "hidden") {
		t.Fatalf("temporary delta emitted: %s", changes)
	}
}

func TestTransactionSetNilDelegatesToDelete(t *testing.T) {
	tx := NewTransaction(map[string]any{"favorite_color": "blue"})
	tx.Set("favorite_color", nil)
	if _, ok := tx.Get("favorite_color"); ok {
		t.Fatal("Set(key, nil) did not remove the key from the transaction")
	}
	patch := tx.Patch()
	if len(patch) != 1 || patch[0].Op != "remove" || patch[0].Path != "/favorite_color" {
		t.Fatalf("patch = %#v, want a single remove op", patch)
	}
	changes := tx.Changes()
	value, ok := changes["favorite_color"]
	if !ok || value != nil {
		t.Fatalf("changes[favorite_color] = %#v, %v; want nil, true (Delete's delta shape)", value, ok)
	}
}

func TestTransactionDeleteAndSnapshotsDoNotAlias(t *testing.T) {
	tx := NewTransaction(map[string]any{"nested": map[string]any{"value": "old"}, "remove": true})
	snapshot := tx.Snapshot()
	snapshot["nested"].(map[string]any)["value"] = "mutated"
	value, _ := tx.Get("nested")
	if value.(map[string]any)["value"] != "old" {
		t.Fatal("snapshot aliased transaction")
	}
	tx.Delete("remove")
	tx.Delete("missing")
	patch := tx.Patch()
	if len(patch) != 1 || patch[0].Op != "remove" || patch[0].Path != "/remove" {
		t.Fatalf("patch = %#v", patch)
	}
}
