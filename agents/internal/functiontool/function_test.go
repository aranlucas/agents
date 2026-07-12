package functiontool

import (
	"testing"

	"github.com/google/jsonschema-go/jsonschema"
)

func TestRemoveAdvertisedNullsRecursively(t *testing.T) {
	schema, err := jsonschema.For[struct {
		Items []string        `json:"items"`
		Meta  *map[string]any `json:"meta,omitempty"`
		Rows  [][]string      `json:"rows"`
	}](nil)
	if err != nil {
		t.Fatal(err)
	}
	removeAdvertisedNulls(schema)
	assertNoAdvertisedNulls(t, schema)
}

func assertNoAdvertisedNulls(t *testing.T, schema *jsonschema.Schema) {
	t.Helper()
	if schema == nil {
		return
	}
	for _, typ := range schema.Types {
		if typ == "null" {
			t.Fatalf("schema still advertises null: %#v", schema)
		}
	}
	for _, child := range schema.Properties {
		assertNoAdvertisedNulls(t, child)
	}
	assertNoAdvertisedNulls(t, schema.Items)
	assertNoAdvertisedNulls(t, schema.AdditionalProperties)
}
