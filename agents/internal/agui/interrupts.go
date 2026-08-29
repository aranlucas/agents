package agui

import (
	json "encoding/json/v2"
	"log"
	"strings"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/types"
	"google.golang.org/adk/v2/session"
)

// requestInputInterrupt converts ADK's durable RequestInput shape to the
// standard AG-UI interrupt consumed by CopilotKit's useInterrupt hook.
func requestInputInterrupt(request *session.RequestInput) (types.Interrupt, bool) {
	if request == nil || strings.TrimSpace(request.InterruptID) == "" {
		return types.Interrupt{}, false
	}

	var responseSchema map[string]any
	if request.ResponseSchema != nil {
		encoded, err := json.Marshal(request.ResponseSchema)
		if err != nil {
			log.Printf("convert request input schema: %v", err)
		} else if err := json.Unmarshal(encoded, &responseSchema); err != nil {
			log.Printf("decode request input schema: %v", err)
		}
	}

	metadata := map[string]any{}
	if request.Payload != nil {
		metadata["payload"] = request.Payload
	}
	return types.Interrupt{
		ID:             request.InterruptID,
		Reason:         "tool_call",
		Message:        request.Message,
		ToolCallID:     request.InterruptID,
		ResponseSchema: responseSchema,
		Metadata:       metadata,
	}, true
}

// unresolvedSessionInterrupts reconstructs the human-input requests that are
// still open in durable ADK history. A browser reconnect can therefore restore
// useInterrupt even after the process-local active-run replay window has ended.
func unresolvedSessionInterrupts(events session.Events) []types.Interrupt {
	if events == nil {
		return nil
	}

	order := make([]string, 0)
	open := make(map[string]types.Interrupt)
	for event := range events.All() {
		if event == nil {
			continue
		}
		if interrupt, ok := requestInputInterrupt(event.RequestedInput); ok {
			if _, exists := open[interrupt.ID]; !exists {
				order = append(order, interrupt.ID)
			}
			open[interrupt.ID] = interrupt
		}
		if event.Content == nil {
			continue
		}
		for _, part := range event.Content.Parts {
			if part == nil || part.FunctionResponse == nil {
				continue
			}
			delete(open, part.FunctionResponse.ID)
		}
	}

	result := make([]types.Interrupt, 0, len(open))
	for _, id := range order {
		if interrupt, ok := open[id]; ok {
			result = append(result, interrupt)
		}
	}
	return result
}
