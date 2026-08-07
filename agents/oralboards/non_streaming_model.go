package oralboards

import (
	"context"
	"iter"

	"google.golang.org/adk/v2/model"
)

// nonStreamingModel asks the provider for one complete response even when the
// outer AG-UI run streams. The evaluator produces large, nested tool arguments;
// buffering that response avoids provider-specific streamed JSON fragments
// becoming an unrecoverable partial function call.
type nonStreamingModel struct {
	model.LLM
}

func (m nonStreamingModel) GenerateContent(ctx context.Context, request *model.LLMRequest, _ bool) iter.Seq2[*model.LLMResponse, error] {
	return m.LLM.GenerateContent(ctx, request, false)
}
