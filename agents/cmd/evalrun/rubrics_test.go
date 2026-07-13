package main

import (
	"encoding/json"
	"testing"

	"agents/expense"
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
