package excalidraw

import (
	"encoding/json"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/tool"
)

const AppName = "excalidraw_agent"

type State struct {
	UserID string `json:"user_id"`
}

func StateDefaults() map[string]any {
	raw, _ := json.Marshal(State{})
	var result map[string]any
	_ = json.Unmarshal(raw, &result)
	return result
}

func New(m model.LLM, toolsets ...tool.Toolset) (agent.Agent, error) {
	return llmagent.New(llmagent.Config{
		Name: AppName, Description: "Interactive Excalidraw diagrams through MCP Apps.",
		Instruction: Instruction, Model: m, Toolsets: toolsets,
	})
}
