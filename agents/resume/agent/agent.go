package resume

import (
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
)

// AppName is the ADK app name resume sessions and D1 rows are scoped under.
// It must match the Python resume agent's app name so evaluation datasets
// and D1 rows stay comparable across the migration.
const AppName = "resume_agent"

// New builds the public resume Q&A agent, using m for inference. The agent
// has no tools and no state schema: it answers strictly from the embedded
// resume grounding in Instruction.
func New(m model.LLM) (agent.Agent, error) {
	return llmagent.New(llmagent.Config{
		Name:        AppName,
		Description: "Public resume Q&A.",
		Instruction: Instruction,
		Model:       m,
	})
}
