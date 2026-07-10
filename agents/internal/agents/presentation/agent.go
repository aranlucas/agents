package presentation

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
	tools, err := presentationTools()
	if err != nil {
		return nil, err
	}
	return llmagent.New(llmagent.Config{Name: AppName, Description: "Presentation outline and slide authoring.", Instruction: Instruction, Model: m, Tools: tools, Toolsets: toolsets})
}

func presentationTools() ([]tool.Tool, error) {
	var tools []tool.Tool
	add := func(value tool.Tool, err error) error {
		if err != nil {
			return err
		}
		tools = append(tools, value)
		return nil
	}
	if err := add(functiontool.New(functiontool.Config{Name: "set_presentation_meta", Description: "Set presentation title and theme."}, wrap(SetMeta))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "create_slide", Description: "Add a slide to the presentation."}, wrap(CreateSlide))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "update_slide", Description: "Update selected fields of an existing slide."}, wrap(UpdateSlide))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "delete_slide", Description: "Delete a slide by ID."}, wrap(DeleteSlide))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "reorder_slides", Description: "Reorder slides using the explicit list of IDs; unlisted slides are removed."}, wrap(ReorderSlides))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "mark_presentation_ready", Description: "Mark the deck ready and record a review summary."}, wrap(MarkReady))); err != nil {
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
				return Result{}, fmt.Errorf("commit presentation state: %w", err)
			}
		}
		return result, nil
	}
}
