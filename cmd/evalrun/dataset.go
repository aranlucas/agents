// Package main implements a Go-native eval runner: it builds each agent
// in-process with whatever inference providers are locally available, runs
// it over that agent's restored rubric dataset, and grades the resulting
// trace with local structural checks (tool-call sequencing, argument
// presence, response-text rules) — no GCP project or ADC required.
package main

import (
	json "encoding/json/v2"
	"fmt"
	"os"
	"strings"
)

// Dataset mirrors the rubric-based EvaluationDataset schema restored from
// internal/<name>/eval/datasets/<name>.json.
type Dataset struct {
	EvalCases []EvalCase `json:"eval_cases"`
}

type EvalCase struct {
	EvalCaseID   string                 `json:"eval_case_id"`
	Prompt       Content                `json:"prompt"`
	RubricGroups map[string]RubricGroup `json:"rubric_groups"`
}

type RubricGroup struct {
	Rubrics []Rubric `json:"rubrics"`
}

type Rubric struct {
	RubricID string `json:"rubric_id"`
	Content  struct {
		Property struct {
			Description string `json:"description"`
		} `json:"property"`
	} `json:"content"`
}

// Content is the restored dataset's user-prompt shape: {"role", "parts": [{"text"}]}.
type Content struct {
	Role  string `json:"role"`
	Parts []struct {
		Text string `json:"text"`
	} `json:"parts"`
}

func (c Content) Text() string {
	var out strings.Builder
	for i, p := range c.Parts {
		if i > 0 {
			out.WriteString(" ")
		}
		out.WriteString(p.Text)
	}
	return out.String()
}

func loadDataset(path string) (Dataset, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Dataset{}, fmt.Errorf("read dataset %s: %w", path, err)
	}
	var ds Dataset
	if err := json.Unmarshal(raw, &ds); err != nil {
		return Dataset{}, fmt.Errorf("parse dataset %s: %w", path, err)
	}
	return ds, nil
}
