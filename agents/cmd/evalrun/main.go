// Command evalrun is a Go-native replacement for the deleted Python
// run_inference.py / run_grade.py scripts: it builds each restored agent
// in-process with whatever inference providers are available locally,
// runs it over agents/<name>/eval/datasets/<name>.json, and grades the
// resulting trace with local structural checks — no GCP project or ADC
// required. See AGENTS.md; this keeps the eval loop framework-agnostic
// and Go-only, matching the rest of the repo.
package main

import (
	"context"
	"encoding/json/jsontext"
	json "encoding/json/v2"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"agents/internal/catalog"
	"agents/internal/config"
)

var allAgents = evalAgentRoutes()

func evalAgentRoutes() []string {
	specs := catalog.Eval()
	routes := make([]string, 0, len(specs))
	for _, spec := range specs {
		routes = append(routes, spec.Route)
	}
	return routes
}

type CaseReport struct {
	EvalCaseID string         `json:"eval_case_id"`
	Prompt     string         `json:"prompt"`
	RunError   string         `json:"run_error,omitempty"`
	Rubrics    []RubricResult `json:"rubrics"`
	Trace      Trace          `json:"trace"`
}

type AgentReport struct {
	Agent         string       `json:"agent"`
	ProviderNotes []string     `json:"provider_notes,omitempty"`
	BuildError    string       `json:"build_error,omitempty"`
	Cases         []CaseReport `json:"cases"`
	RubricsPassed int          `json:"rubrics_passed"`
	RubricsTotal  int          `json:"rubrics_total"`
}

func main() {
	var agentsFlag string
	var caseFlag string
	flag.StringVar(&agentsFlag, "agents", "all", "comma-separated agent names, or 'all'")
	flag.StringVar(&caseFlag, "case", "all", "one eval case id, or 'all'")
	flag.Parse()

	names := allAgents
	if agentsFlag != "all" {
		names = strings.Split(agentsFlag, ",")
	}

	providers := loadEvalProviders()
	ctx := context.Background()

	var reports []AgentReport
	exit := 0
	for _, name := range names {
		name = strings.TrimSpace(name)
		report := runAgentEval(ctx, name, caseFlag, providers)
		reports = append(reports, report)
		printReport(report)
		if reportFailed(report) {
			exit = 1
		}
	}

	if err := writeReports(reports); err != nil {
		fmt.Fprintf(os.Stderr, "warning: failed to write artifacts: %v\n", err)
	}

	os.Exit(exit)
}

func reportFailed(report AgentReport) bool {
	if report.BuildError != "" || report.RubricsPassed < report.RubricsTotal {
		return true
	}
	for _, evalCase := range report.Cases {
		if evalCase.RunError != "" {
			return true
		}
	}
	return false
}

func runAgentEval(ctx context.Context, name, caseID string, providers map[string]config.Provider) AgentReport {
	report := AgentReport{Agent: name}

	built, err := buildAgent(ctx, name, providers)
	if err != nil {
		report.BuildError = err.Error()
		return report
	}
	report.ProviderNotes = built.Notes

	datasetPath := filepath.Join("agents", name, "eval", "datasets", datasetFileName(name))
	ds, err := loadDataset(datasetPath)
	if err != nil {
		report.BuildError = err.Error()
		return report
	}

	matched := false
	for _, ec := range ds.EvalCases {
		if caseID != "all" && ec.EvalCaseID != caseID {
			continue
		}
		matched = true
		trace := runCase(ctx, built.Agent.Name(), built.Agent, built.StateDefaults, ec.EvalCaseID, ec.Prompt.Text())
		caseReport := CaseReport{EvalCaseID: ec.EvalCaseID, Prompt: ec.Prompt.Text(), RunError: trace.RunError, Trace: trace}
		for _, group := range ec.RubricGroups {
			for _, rubric := range group.Rubrics {
				result := gradeRubric(name, rubric.RubricID, rubric.Content.Property.Description, trace)
				caseReport.Rubrics = append(caseReport.Rubrics, result)
				report.RubricsTotal++
				if result.Pass {
					report.RubricsPassed++
				}
			}
		}
		report.Cases = append(report.Cases, caseReport)
	}
	if !matched {
		report.BuildError = fmt.Sprintf("eval case %q was not found for agent %q", caseID, name)
	}
	return report
}

// datasetFileName maps an agent name to its restored dataset file — the
// oralboards file uses a hyphen, everything else matches the agent name.
func datasetFileName(name string) string {
	if name == "oralboards" {
		return "oral-boards.json"
	}
	return name + ".json"
}

func writeReports(reports []AgentReport) error {
	for _, r := range reports {
		dir := filepath.Join("agents", r.Agent, "artifacts", "grade_results")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
		encoded, err := json.Marshal(r, json.Deterministic(true), jsontext.Multiline(true), jsontext.WithIndent("  "))
		if err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(dir, "results_evalrun.json"), encoded, 0o644); err != nil {
			return err
		}
	}
	return nil
}

func printReport(r AgentReport) {
	fmt.Printf("\n=== %s ===\n", r.Agent)
	if r.BuildError != "" {
		fmt.Printf("  BUILD ERROR: %s\n", r.BuildError)
		return
	}
	for _, note := range r.ProviderNotes {
		fmt.Printf("  note: %s\n", note)
	}
	for _, c := range r.Cases {
		fmt.Printf("  case %s:\n", c.EvalCaseID)
		if c.RunError != "" {
			fmt.Printf("    RUN ERROR: %s\n", c.RunError)
			continue
		}
		for _, rub := range c.Rubrics {
			mark := "FAIL"
			if rub.Pass {
				mark = "PASS"
			}
			fmt.Printf("    [%s] %s — %s\n", mark, rub.RubricID, rub.Explanation)
		}
	}
	fmt.Printf("  %d/%d rubrics passed\n", r.RubricsPassed, r.RubricsTotal)
}
