package travel

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
	tools, err := travelTools()
	if err != nil {
		return nil, err
	}
	return llmagent.New(llmagent.Config{Name: AppName, Description: "Trip planning, itinerary drafting, and booking readiness.", Instruction: Instruction, Model: m, Tools: tools, Toolsets: toolsets})
}

func travelTools() ([]tool.Tool, error) {
	var tools []tool.Tool
	add := func(value tool.Tool, err error) error {
		if err != nil {
			return err
		}
		tools = append(tools, value)
		return nil
	}
	definitions := []struct {
		name, description string
		build             func() (tool.Tool, error)
	}{
		{"set_trip_meta", "Set validated destination, dates, party size, and budget before drafting.", func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "set_trip_meta", Description: "Set validated destination, dates, party size, and budget before drafting."}, wrap(SetTripMeta))
		}},
		{"write_itinerary", "Replace the structured itinerary and optional flights state.", func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "write_itinerary", Description: "Replace the structured itinerary and optional flights state."}, wrap(WriteItinerary))
		}},
		{"add_day", "Replace or append one structured itinerary day.", func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "add_day", Description: "Replace or append one structured itinerary day."}, wrap(AddDay))
		}},
		{"mark_ready_to_book", "Mark a complete itinerary ready for explicit booking approval.", func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "mark_ready_to_book", Description: "Mark a complete itinerary ready for explicit booking approval."}, wrap(MarkReadyToBook))
		}},
		{"get_current_date", "Return the current UTC calendar date.", func() (tool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "get_current_date", Description: "Return the current UTC calendar date."}, wrap(GetCurrentDate))
		}},
	}
	for _, definition := range definitions {
		value, err := definition.build()
		if err := add(value, err); err != nil {
			return nil, fmt.Errorf("build %s tool: %w", definition.name, err)
		}
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
				return Result{}, fmt.Errorf("commit travel state: %w", err)
			}
		}
		return result, nil
	}
}
