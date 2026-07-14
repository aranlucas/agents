package main

import (
	"context"
	"encoding/json"
	"fmt"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/runner"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

// Step is one normalized unit of an agent run: a model text chunk, a tool
// call, or a tool result.
type Step struct {
	Author                string          `json:"author"`
	Text                  string          `json:"text,omitempty"`
	FunctionCall          string          `json:"function_call,omitempty"`
	FunctionCallArgs      json.RawMessage `json:"function_call_args,omitempty"`
	FunctionResponse      string          `json:"function_response,omitempty"`
	FunctionResponseValue json.RawMessage `json:"function_response_value,omitempty"`
}

// Trace is the full normalized record of one eval case's run, used as
// grading input.
type Trace struct {
	CaseID    string `json:"case_id"`
	Prompt    string `json:"prompt"`
	Steps     []Step `json:"steps"`
	FinalText string `json:"final_text"`
	RunError  string `json:"run_error,omitempty"`
}

// runCase executes one turn of built against a fresh in-memory session
// seeded from stateDefaults, and returns the normalized trace.
func runCase(ctx context.Context, appName string, built agent.Agent, stateDefaults func() map[string]any, caseID, prompt string) Trace {
	trace := Trace{CaseID: caseID, Prompt: prompt}

	sessions := session.InMemoryService()
	userID, threadID := "eval_user", "eval_thread_"+caseID
	if _, err := sessions.Create(ctx, &session.CreateRequest{AppName: appName, UserID: userID, SessionID: threadID, State: stateDefaults()}); err != nil {
		trace.RunError = fmt.Sprintf("create session: %v", err)
		return trace
	}
	rn, err := runner.New(runner.Config{AppName: appName, Agent: built, SessionService: sessions, AutoCreateSession: true})
	if err != nil {
		trace.RunError = fmt.Sprintf("build runner: %v", err)
		return trace
	}

	content := genai.NewContentFromText(prompt, genai.RoleUser)
	for event, err := range rn.Run(ctx, userID, threadID, content, agent.RunConfig{StreamingMode: agent.StreamingModeSSE}) {
		if err != nil {
			trace.RunError = fmt.Sprintf("run: %v", err)
			return trace
		}
		if event.Partial {
			continue
		}
		if event.Content == nil {
			continue
		}
		for _, part := range event.Content.Parts {
			if part.Thought {
				// Reasoning-model "thinking" text is not the agent's chat
				// response — including it would make concise final
				// answers look arbitrarily long to text-length rubrics.
				continue
			}
			step := Step{Author: event.Author}
			switch {
			case part.FunctionCall != nil:
				step.FunctionCall = part.FunctionCall.Name
				step.FunctionCallArgs, err = json.Marshal(part.FunctionCall.Args)
				if err != nil {
					trace.RunError = fmt.Sprintf("encode %s arguments: %v", part.FunctionCall.Name, err)
					return trace
				}
			case part.FunctionResponse != nil:
				step.FunctionResponse = part.FunctionResponse.Name
				step.FunctionResponseValue, err = json.Marshal(part.FunctionResponse.Response)
				if err != nil {
					trace.RunError = fmt.Sprintf("encode %s response: %v", part.FunctionResponse.Name, err)
					return trace
				}
			case part.Text != "":
				step.Text = part.Text
				trace.FinalText = part.Text
			default:
				continue
			}
			trace.Steps = append(trace.Steps, step)
		}
	}
	return trace
}
