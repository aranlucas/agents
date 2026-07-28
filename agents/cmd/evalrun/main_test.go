package main

import "testing"

func TestReportFailedIncludesRunErrors(t *testing.T) {
	tests := []struct {
		name   string
		report AgentReport
		failed bool
	}{
		{name: "passing", report: AgentReport{RubricsPassed: 2, RubricsTotal: 2}, failed: false},
		{name: "build error", report: AgentReport{BuildError: "no model"}, failed: true},
		{name: "rubric failure", report: AgentReport{RubricsPassed: 1, RubricsTotal: 2}, failed: true},
		{name: "run error", report: AgentReport{
			RubricsPassed: 2, RubricsTotal: 2, Cases: []CaseReport{{RunError: "rate limited"}},
		}, failed: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := reportFailed(test.report); got != test.failed {
				t.Fatalf("reportFailed() = %v, want %v", got, test.failed)
			}
		})
	}
}
