package research

import (
	"context"
	"fmt"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

func New(m model.LLM, toolsets ...tool.Toolset) (agent.Agent, error) {
	tools, err := researchTools()
	if err != nil {
		return nil, err
	}
	return llmagent.New(llmagent.Config{Name: AppName, Description: "Research canvas, sources, sections, and reports.", Instruction: Instruction, Model: m, Tools: tools, Toolsets: toolsets})
}
func researchTools() ([]tool.Tool, error) {
	var tools []tool.Tool
	add := func(value tool.Tool, err error) error {
		if err != nil {
			return err
		}
		tools = append(tools, value)
		return nil
	}
	if err := add(functiontool.New(functiontool.Config{Name: "set_research_query", Description: "Set the report title and research query."}, wrap(SetQuery))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "create_section", Description: "Append a report section and rebuild ordered markdown."}, wrap(CreateSection))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "update_section", Description: "Update section content by ID and rebuild ordered markdown."}, wrap(UpdateSection))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "add_source", Description: "Append a validated HTTPS citation source."}, wrap(AddSource))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "write_report", Description: "Replace the complete markdown report."}, wrap(WriteReport))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "mark_research_ready", Description: "Mark the report ready and record its review summary."}, wrap(MarkReady))); err != nil {
		return nil, err
	}
	return tools, nil
}

type handler[A any] func(context.Context, *agentruntime.Transaction, A) (Result, error)

func wrap[A any](handler handler[A]) functiontool.Func[A, Result] {
	return func(ctx agent.Context, input A) (Result, error) {
		tx := agentruntime.NewTransactionFromState(ctx.State())
		result, err := handler(ctx, tx, input)
		if err != nil {
			return Result{}, err
		}
		if result.OK {
			if err := agentruntime.Commit(ctx, tx); err != nil {
				return Result{}, fmt.Errorf("commit research state: %w", err)
			}
		}
		return result, nil
	}
}
