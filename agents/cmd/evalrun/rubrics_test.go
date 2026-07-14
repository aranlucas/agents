package main

import (
	"encoding/json"
	"testing"

	"agents/expense"
	"agents/presentation"
)

func TestFirstCallArgsDecodesTheRegisteredToolType(t *testing.T) {
	valid := Trace{Steps: []Step{{
		FunctionCall:     "submit_expense",
		FunctionCallArgs: json.RawMessage(`{"amount":42.5,"submitter":"Ada","category":"travel","date":"2026-07-12"}`),
	}}}
	args, ok := firstCallArgs[expense.SubmitExpenseArgs](valid, "submit_expense")
	if !ok || args.Amount != 42.5 || args.Submitter != "Ada" {
		t.Fatalf("args = %#v, ok = %v", args, ok)
	}

	invalid := Trace{Steps: []Step{{
		FunctionCall:     "submit_expense",
		FunctionCallArgs: json.RawMessage(`{"amount":"forty two"}`),
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

func functionResponseStep(name, value string) Step {
	return Step{FunctionResponse: name, FunctionResponseValue: json.RawMessage(value)}
}
