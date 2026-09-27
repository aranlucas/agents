package oralboards

import (
	"context"
	"iter"
	"testing"

	"google.golang.org/adk/v2/model"
)

type streamCapturingModel struct {
	stream bool
}

func (m *streamCapturingModel) Name() string { return "stream-capturing" }

func (m *streamCapturingModel) GenerateContent(_ context.Context, _ *model.LLMRequest, stream bool) iter.Seq2[*model.LLMResponse, error] {
	m.stream = stream
	return func(func(*model.LLMResponse, error) bool) {}
}

func TestNonStreamingModelBuffersProviderResponse(t *testing.T) {
	inner := &streamCapturingModel{stream: true}
	for range (nonStreamingModel{inner}).GenerateContent(t.Context(), &model.LLMRequest{}, true) {
	}
	if inner.stream {
		t.Fatal("evaluator provider call streamed")
	}
}
