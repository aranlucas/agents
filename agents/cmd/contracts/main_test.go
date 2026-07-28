package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestGeneratedContractsExcludeServerOnlyState(t *testing.T) {
	generated, err := generateTypeScript()
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"user_id?:", "_probe_used", "_search_docs_calls", "case_passages", "question_craft_feedback", "last_delegation"} {
		if bytes.Contains(generated, []byte(forbidden)) {
			t.Fatalf("generated client contract exposes server-only field %q", forbidden)
		}
	}
}

func TestGeneratedSchemasExcludeServerOnlyState(t *testing.T) {
	schemas, err := generateJSONSchemas()
	if err != nil {
		t.Fatal(err)
	}
	if len(schemas) != 13 {
		t.Fatalf("generated %d schemas, want 13", len(schemas))
	}
	for path, schema := range schemas {
		for _, forbidden := range []string{`"user_id"`, `"_probe_used"`, `"_search_docs_calls"`, `"case_passages"`} {
			if bytes.Contains(schema, []byte(forbidden)) {
				t.Fatalf("schema %s exposes server-only field %s", path, forbidden)
			}
		}
	}
}

func TestGeneratedSchemasMatchNestedClientProjection(t *testing.T) {
	schemas, err := generateJSONSchemas()
	if err != nil {
		t.Fatal(err)
	}
	var grocery map[string]any
	if err := json.Unmarshal(schemas["packages/types/src/generated/schemas/grocery.schema.json"], &grocery); err != nil {
		t.Fatal(err)
	}
	properties := grocery["properties"].(map[string]any)
	cart := properties["cart"].(map[string]any)
	item := cart["items"].(map[string]any)
	required := item["required"].([]any)
	if got := strings.Join([]string{required[0].(string), required[1].(string)}, ","); got != "name,quantity" {
		t.Fatalf("CartItem required = %q, want name,quantity", got)
	}
	if status := item["properties"].(map[string]any); status["price"].(map[string]any)["type"] != "number" {
		t.Fatalf("CartItem price schema = %#v", status["price"])
	}

	var fitness map[string]any
	if err := json.Unmarshal(schemas["packages/types/src/generated/schemas/fitness.schema.json"], &fitness); err != nil {
		t.Fatal(err)
	}
	activity := fitness["properties"].(map[string]any)["activities"].(map[string]any)["items"].(map[string]any)
	activityRequired := activity["required"].([]any)
	if got := strings.Join([]string{activityRequired[0].(string), activityRequired[1].(string)}, ","); got != "id,name" {
		t.Fatalf("FitnessActivity required = %q, want id,name", got)
	}
	if got := activity["properties"].(map[string]any)["source"].(map[string]any)["enum"].([]any); len(got) != 4 {
		t.Fatalf("FitnessActivity source enum = %#v", got)
	}
	if got := activity["properties"].(map[string]any)["sport_type"].(map[string]any)["type"]; got != "string" {
		t.Fatalf("FitnessActivity sport_type type = %#v, want string", got)
	}
}

func TestGeneratedCatalogUsesClientAndBackendIdentities(t *testing.T) {
	generated, err := generateTypeScript()
	if err != nil {
		t.Fatal(err)
	}
	text := string(generated)
	if !strings.Contains(text, `"oral-boards": "oralboards"`) {
		t.Fatalf("generated catalog is missing oral-boards backend mapping:\n%s", text)
	}
	if strings.Count(text, "export type AgentId") != 1 {
		t.Fatalf("generated AgentId declaration count is not one")
	}
}

func TestGeneratedOutputsAreDeterministic(t *testing.T) {
	first, err := generatedOutputs()
	if err != nil {
		t.Fatal(err)
	}
	second, err := generatedOutputs()
	if err != nil {
		t.Fatal(err)
	}
	for name := range first {
		if !bytes.Equal(first[name], second[name]) {
			t.Fatalf("generated output %s is not deterministic", name)
		}
	}
}

func TestCompactPrimitiveArraysHonorsLineWidth(t *testing.T) {
	input := []byte("{\n  \"short\": [\n    \"a\",\n    \"b\"\n  ],\n  \"numbers\": [\n    1,\n    2,\n    3\n  ],\n  \"long\": [\n    \"aaaaaaaaaa\",\n    \"bbbbbbbbbb\"\n  ]\n}")
	got := string(compactPrimitiveArrays(input, 25))
	if !strings.Contains(got, `  "short": ["a", "b"],`) {
		t.Fatalf("short array was not compacted:\n%s", got)
	}
	if !strings.Contains(got, `  "numbers": [1, 2, 3],`) {
		t.Fatalf("numeric array was not compacted:\n%s", got)
	}
	if strings.Contains(got, `"long": ["aaaaaaaaaa"`) {
		t.Fatalf("long array exceeded line width:\n%s", got)
	}
}
