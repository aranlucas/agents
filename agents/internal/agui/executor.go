package agui

import (
	"context"
	"time"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/types"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/runner"
	"google.golang.org/genai"
)

// runExecution owns one ADK invocation and its AG-UI lifecycle. The HTTP layer
// owns authentication, durable leases, replay, and sanitized error publication.
// A detached browser need not stop a durable run.
type runExecution struct {
	runner     *runner.Runner
	input      *types.RunAgentInput
	userID     string
	content    *genai.Content
	stateDelta map[string]any
	snapshot   stateDocument
	converter  *streamConverter
	smoothing  streamSmoothing
}

func (e *runExecution) execute(ctx context.Context, emit func(context.Context, events.Event) error) error {
	if err := emit(ctx, events.NewRunStartedEvent(e.input.ThreadID, e.input.RunID)); err != nil {
		return err
	}
	if err := emit(ctx, events.NewStateSnapshotEvent(e.snapshot)); err != nil {
		return err
	}
	if e.content == nil {
		return emit(ctx, events.NewRunFinishedEventWithOptions(e.input.ThreadID, e.input.RunID, events.WithSuccessOutcome()))
	}
	var opts []runner.RunOption
	if e.stateDelta != nil {
		opts = append(opts, runner.WithStateDelta(e.stateDelta))
	}
	lastWasTextContent := false
	for event, err := range e.runner.Run(ctx, e.userID, e.input.ThreadID, e.content, agent.RunConfig{StreamingMode: agent.StreamingModeSSE}, opts...) {
		if err != nil {
			return err
		}
		convertedEvents, err := e.converter.Convert(event)
		if err != nil {
			return err
		}
		for _, converted := range convertedEvents {
			if e.smoothing.enabled && e.smoothing.chunkDelay > 0 && converted.Type() == events.EventTypeTextMessageContent && lastWasTextContent {
				timer := time.NewTimer(e.smoothing.chunkDelay)
				select {
				case <-timer.C:
				case <-ctx.Done():
					timer.Stop()
					return ctx.Err()
				}
			}
			if err := emit(ctx, converted); err != nil {
				return err
			}
			lastWasTextContent = converted.Type() == events.EventTypeTextMessageContent
		}
	}
	// ADK may stop iteration without yielding the canceled context's error.
	if err := ctx.Err(); err != nil {
		return err
	}
	outcome := events.WithSuccessOutcome()
	if interrupts := e.converter.Interrupts(); len(interrupts) > 0 {
		outcome = events.WithInterruptOutcome(interrupts)
	}
	finished := events.NewRunFinishedEventWithOptions(e.input.ThreadID, e.input.RunID, outcome)
	if e.converter.lastFinalText != "" {
		finished.Result = e.converter.lastFinalText
	}
	return emit(ctx, finished)
}

// flush closes open message lanes before the handler publishes RUN_ERROR.
func (e *runExecution) flush(ctx context.Context, emit func(context.Context, events.Event) error) error {
	if e.converter != nil {
		for _, event := range e.converter.Flush() {
			if err := emit(ctx, event); err != nil {
				return err
			}
		}
	}
	return nil
}
