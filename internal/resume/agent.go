package resume

import (
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
	"google.golang.org/genai"
)

// AppName is the ADK app name resume sessions and D1 rows are scoped under.
// It must match the Python resume agent's app name so evaluation datasets
// and D1 rows stay comparable across the migration.
const AppName = "resume_agent"

// New builds the public resume assistant, using m for inference. It preserves
// grounded Q&A while adding an optional stateful job-fit workflow.
func New(m model.LLM, toolsets ...tool.Toolset) (agent.Agent, error) {
	setTargetRoleTool, err := functiontool.New(functiontool.Config{
		Name:        "set_target_role",
		Description: "Capture a target role and its job description, resetting any stale assessment.",
	}, SetTargetRole)
	if err != nil {
		return nil, err
	}

	writeFitAssessmentTool, err := functiontool.New(functiontool.Config{
		Name:        "write_fit_assessment",
		Description: "Write a resume-grounded fit summary, honest gaps, and tailored resume bullets.",
	}, WriteFitAssessment)
	if err != nil {
		return nil, err
	}

	markResumeReadyTool, err := functiontool.New(functiontool.Config{
		Name:        "mark_resume_ready",
		Description: "Validate the completed job-fit assessment and mark it ready for review.",
	}, MarkResumeReady)
	if err != nil {
		return nil, err
	}

	return llmagent.New(llmagent.Config{
		Name:        AppName,
		Description: "Public grounded resume Q&A and job-fit tailoring.",
		Instruction: Instruction,
		Model:       m,
		GenerateContentConfig: &genai.GenerateContentConfig{
			MaxOutputTokens: 2048,
		},
		Tools: []tool.Tool{
			setTargetRoleTool,
			writeFitAssessmentTool,
			markResumeReadyTool,
		},
		Toolsets: toolsets,
	})
}
