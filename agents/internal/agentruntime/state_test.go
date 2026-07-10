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
