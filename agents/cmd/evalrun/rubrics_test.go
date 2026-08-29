package main

import (
	"encoding/json/jsontext"
	"testing"

	"agents/expense"
	"agents/presentation"
)

func TestFirstCallArgsDecodesTheRegisteredToolType(t *testing.T) {
	valid := Trace{Steps: []Step{{
		FunctionCall:     "submit_expense",
		FunctionCallArgs: jsontext.Value(`{"amount":42.5,"submitter":"Ada","category":"travel","date":"2026-07-12"}`),
	}}}
	args, ok := firstCallArgs[expense.SubmitExpenseArgs](valid, "submit_expense")
	if !ok || args.Amount != 42.5 || args.Submitter != "Ada" {
		t.Fatalf("args = %#v, ok = %v", args, ok)
	}

	invalid := Trace{Steps: []Step{{
		FunctionCall:     "submit_expense",
		FunctionCallArgs: jsontext.Value(`{"amount":"forty two"}`),
	}}}
	if _, ok := firstCallArgs[expense.SubmitExpenseArgs](invalid, "submit_expense"); ok {
		t.Fatal("argument object with the wrong field type was accepted")
	}
}

func TestFirstResponseDecodesTheRegisteredToolResult(t *testing.T) {
	trace := Trace{Steps: []Step{functionResponseStep("build_presentation", `{"ok":true,"slide_ids":["a","b"],"slide_count":2}`)}}
	result, ok := firstResponse[presentation.Result](trace, "build_presentation")
	if !ok || !result.OK || result.SlideCount != 2 || len(result.SlideIDs) != 2 {
		t.Fatalf("result = %#v, ok = %v", result, ok)
	}
}

func TestInterviewRubricsRequireSequentialStateToolsAndGroundedFeedback(t *testing.T) {
	trace := Trace{
		Steps: []Step{
			{FunctionCall: "configure_interview", FunctionCallArgs: jsontext.Value(`{"track":"behavioral","target_question_count":1}`)},
			functionResponseStep("configure_interview", `{"ok":true,"status":"practicing"}`),
			{FunctionCall: "select_question", FunctionCallArgs: jsontext.Value(`{}`)},
			functionResponseStep("select_question", `{"ok":true,"status":"practicing"}`),
			{FunctionCall: "record_attempt_feedback", FunctionCallArgs: jsontext.Value(`{
				"attempt_summary":"I proposed a staged rollout.",
				"rubric":[
					{"dimension":"structure","score":3,"evidence":"Clear sequence."},
					{"dimension":"specificity","score":3,"evidence":"Named the action."},
					{"dimension":"impact","score":2,"evidence":"Impact was not measured."},
					{"dimension":"reflection","score":2,"evidence":"Reflection was missing."}
				],
				"feedback":"Ask what impact was actually measured.",
				"strengths":["Clear action"],
				"improvements":["Add the real outcome"]
			}`)},
			functionResponseStep("record_attempt_feedback", `{"ok":true,"status":"feedback"}`),
			{FunctionCall: "complete_interview", FunctionCallArgs: jsontext.Value(`{"session_summary":"One answer scored.","next_steps":["Add the real outcome"]}`)},
			functionResponseStep("complete_interview", `{"ok":true,"status":"complete"}`),
			{Text: "Session complete. Ask what impact was actually measured."},
		},
		FinalText: "Session complete. Ask what impact was actually measured.",
	}

	for _, rubricID := range []string{
		"interview_configures_behavioral",
		"interview_selects_one_question",
		"interview_records_behavioral_rubric",
		"interview_behavioral_no_example_metrics",
		"interview_feedback_before_completion",
	} {
		if result := gradeRubric("interview", rubricID, "test", trace); !result.Pass {
			t.Errorf("%s failed: %s", rubricID, result.Explanation)
		}
	}

	trace.Steps[len(trace.Steps)-1].Text = "Add an impact number, for example 10,000 users."
	if result := gradeRubric("interview", "interview_behavioral_no_example_metrics", "test", trace); result.Pass {
		t.Fatal("illustrative metric passed grounding rubric")
	}
}

func functionResponseStep(name, value string) Step {
	return Step{FunctionResponse: name, FunctionResponseValue: jsontext.Value(value)}
}
