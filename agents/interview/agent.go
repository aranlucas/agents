package interview

import (
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
	"google.golang.org/genai"
)

func New(m model.LLM, toolsets ...tool.Toolset) (agent.Agent, error) {
	tools, err := interviewTools()
	if err != nil {
		return nil, err
	}
	return llmagent.New(llmagent.Config{
		Name:        AppName,
		Description: "Behavioral and coding interview practice for software engineers.",
		Instruction: Instruction,
		Model:       m,
		GenerateContentConfig: &genai.GenerateContentConfig{
			MaxOutputTokens: 4096,
		},
		AfterModelCallbacks: []llmagent.AfterModelCallback{enforceInterviewOutput},
		Tools:               tools,
		Toolsets:            toolsets,
	})
}

func interviewTools() ([]tool.Tool, error) {
	configureTool, err := functiontool.New(functiontool.Config{
		Name:        "configure_interview",
		Description: "Start or reset a behavioral or coding interview practice session.",
	}, Configure)
	if err != nil {
		return nil, err
	}
	selectQuestionTool, err := functiontool.New(functiontool.Config{
		Name:        "select_question",
		Description: "Select the next unused local question matching the configured practice session.",
	}, SelectQuestion)
	if err != nil {
		return nil, err
	}
	recordFeedbackTool, err := functiontool.New(functiontool.Config{
		Name:        "record_attempt_feedback",
		Description: "Required before showing scores: record a meaningful answer against every track rubric dimension with evidence.",
	}, RecordAttemptFeedback)
	if err != nil {
		return nil, err
	}
	requestHintTool, err := functiontool.New(functiontool.Config{
		Name:        "request_hint",
		Description: "Reveal exactly one progressive hint for the active coding question.",
	}, RequestHint)
	if err != nil {
		return nil, err
	}
	completeTool, err := functiontool.New(functiontool.Config{
		Name:        "complete_interview",
		Description: "Required before claiming completion: finish only after the target count is scored and save summary and next steps.",
	}, CompleteInterview)
	if err != nil {
		return nil, err
	}
	return []tool.Tool{configureTool, selectQuestionTool, recordFeedbackTool, requestHintTool, completeTool}, nil
}
