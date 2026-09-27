package resume

import (
	json "encoding/json/v2"
	"slices"
	"testing"
)

func TestStateDefaultsUseStableEmptyCollections(t *testing.T) {
	state := Defaults()
	if state.Status != StatusIdle || state.Gaps == nil || state.TailoredBullets == nil {
		t.Fatalf("Defaults() = %#v", state)
	}
	defaults := StateDefaults()
	if len(defaults) != 7 {
		t.Fatalf("StateDefaults() keys = %#v", defaults)
	}
	if defaults["status"] != string(StatusIdle) {
		t.Fatalf("status default = %#v", defaults["status"])
	}
	for _, key := range []string{"target_role", "job_description", "fit_summary", "review_summary"} {
		if defaults[key] != "" {
			t.Fatalf("%s default = %#v", key, defaults[key])
		}
	}
	if defaults["gaps"] == nil || defaults["tailored_bullets"] == nil {
		t.Fatalf("collection defaults = %#v", defaults)
	}
}

func TestSetTargetRoleResetsStaleAssessment(t *testing.T) {
	state := ResumeState{
		TargetRole:      "Old role",
		JobDescription:  "Old description",
		FitSummary:      "Old summary",
		Gaps:            []string{"Old gap"},
		TailoredBullets: []string{"Old bullet"},
		Status:          StatusReady,
		ReviewSummary:   "Old review",
	}
	result, err := setTargetRole(&state, SetTargetRoleArgs{
		TargetRole:     " Staff Software Engineer ",
		JobDescription: " Build reliable AI products. ",
	})
	if err != nil || !result.OK {
		t.Fatalf("setTargetRole() = %#v, %v", result, err)
	}
	if state.TargetRole != "Staff Software Engineer" || state.JobDescription != "Build reliable AI products." {
		t.Fatalf("target = %#v", state)
	}
	if state.Status != StatusAnalyzing || state.FitSummary != "" || len(state.Gaps) != 0 || len(state.TailoredBullets) != 0 || state.ReviewSummary != "" {
		t.Fatalf("stale assessment was not reset: %#v", state)
	}
}

func TestSetTargetRoleRejectsIncompleteInputWithoutMutation(t *testing.T) {
	state := Defaults()
	before := mustJSON(state)
	result, err := setTargetRole(&state, SetTargetRoleArgs{TargetRole: "Staff engineer"})
	if err != nil || result.OK || result.Error == nil || result.Error.Code != "job_description_required" {
		t.Fatalf("setTargetRole() = %#v, %v", result, err)
	}
	if string(before) != string(mustJSON(state)) {
		t.Fatalf("invalid target mutated state: %#v", state)
	}
}

func TestFitAssessmentRequiresTargetAndValidBullets(t *testing.T) {
	state := Defaults()
	input := WriteFitAssessmentArgs{FitSummary: "Strong fit", TailoredBullets: []string{"Led a launch."}}
	result, err := writeFitAssessment(&state, input)
	if err != nil || result.OK || result.Error == nil || result.Error.Code != "target_job_required" {
		t.Fatalf("missing target result = %#v, %v", result, err)
	}

	_, _ = setTargetRole(&state, SetTargetRoleArgs{TargetRole: "Staff engineer", JobDescription: "Lead AI product delivery."})
	before := mustJSON(state)
	input.TailoredBullets = []string{" "}
	result, err = writeFitAssessment(&state, input)
	if err != nil || result.OK || result.Error == nil || result.Error.Code != "invalid_tailored_bullets" {
		t.Fatalf("invalid bullets result = %#v, %v", result, err)
	}
	if string(before) != string(mustJSON(state)) {
		t.Fatalf("invalid assessment mutated state: %#v", state)
	}
}

func TestResumeFitWorkflowReachesReady(t *testing.T) {
	state := Defaults()
	_, _ = setTargetRole(&state, SetTargetRoleArgs{
		TargetRole:     "Staff AI Product Engineer",
		JobDescription: "Lead cross-functional AI product launches and build agent infrastructure.",
	})
	assessment, err := writeFitAssessment(&state, WriteFitAssessmentArgs{
		FitSummary: "Strong documented fit for application-layer AI product delivery.",
		Gaps:       []string{"No documented ML model-training ownership.", "No documented ML model-training ownership."},
		TailoredBullets: []string{
			"Pitched and prototyped Ask DoorDash, secured leadership buy-in, and led cross-functional delivery.",
			"Built production agent infrastructure across Go and TypeScript clients.",
		},
	})
	if err != nil || !assessment.OK || state.Status != StatusAnalyzing {
		t.Fatalf("writeFitAssessment() = %#v, %v; state = %#v", assessment, err, state)
	}
	if !slices.Equal(state.Gaps, []string{"No documented ML model-training ownership."}) {
		t.Fatalf("gaps = %#v", state.Gaps)
	}

	ready, err := markResumeReady(&state, MarkReadyArgs{ReviewSummary: "Grounded fit assessment ready; ML training remains the main evidence gap."})
	if err != nil || !ready.OK || state.Status != StatusReady || state.ReviewSummary == "" {
		t.Fatalf("markResumeReady() = %#v, %v; state = %#v", ready, err, state)
	}
}

func TestMarkResumeReadyValidatesCompleteness(t *testing.T) {
	state := Defaults()
	_, _ = setTargetRole(&state, SetTargetRoleArgs{TargetRole: "Staff engineer", JobDescription: "Build AI products."})
	result, err := markResumeReady(&state, MarkReadyArgs{ReviewSummary: "Ready"})
	if err != nil || result.OK || result.Error == nil || result.Error.Code != "fit_summary_required" || state.Status == StatusReady {
		t.Fatalf("markResumeReady() = %#v, %v; state = %#v", result, err, state)
	}
}

func TestMarkResumeReadyRejectsCorruptAssessmentItems(t *testing.T) {
	state := ResumeState{
		TargetRole:      "Staff engineer",
		JobDescription:  "Build AI products.",
		FitSummary:      "Strong fit.",
		Gaps:            []string{},
		TailoredBullets: []string{" "},
		Status:          StatusAnalyzing,
	}
	result, err := markResumeReady(&state, MarkReadyArgs{ReviewSummary: "Ready"})
	if err != nil || result.OK || result.Error == nil || result.Error.Code != "invalid_tailored_bullets" || state.Status == StatusReady {
		t.Fatalf("markResumeReady() = %#v, %v; state = %#v", result, err, state)
	}
}

func mustJSON(value any) []byte {
	encoded, _ := json.Marshal(value)
	return encoded
}
