package openai

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/shared"
	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

func buildRequest(req *model.LLMRequest, modelName string, stream bool) (openai.ChatCompletionNewParams, error) {
	if req == nil {
		return openai.ChatCompletionNewParams{}, errors.New("LLM request is required")
	}
	if strings.TrimSpace(modelName) == "" {
		return openai.ChatCompletionNewParams{}, errors.New("provider model is required")
	}
	result := openai.ChatCompletionNewParams{
		Model: openai.ChatModel(modelName),
	}
	if stream {
		result.StreamOptions = openai.ChatCompletionStreamOptionsParam{IncludeUsage: openai.Bool(true)}
	}
	if req.Config != nil {
		config := req.Config
		if config.SystemInstruction != nil {
			text, err := textContent(config.SystemInstruction)
			if err != nil {
				return openai.ChatCompletionNewParams{}, fmt.Errorf("system instruction: %w", err)
			}
			if text != "" {
				result.Messages = append(result.Messages, openai.SystemMessage(text))
			}
		}
		if config.Temperature != nil {
			result.Temperature = openai.Float(float64(*config.Temperature))
		}
		if config.TopP != nil {
			result.TopP = openai.Float(float64(*config.TopP))
		}
		if config.MaxOutputTokens > 0 {
			result.MaxCompletionTokens = openai.Int(int64(config.MaxOutputTokens))
		}
		if len(config.StopSequences) > 0 {
			result.Stop = openai.ChatCompletionNewParamsStopUnion{
				OfStringArray: config.StopSequences,
			}
		}
		if config.PresencePenalty != nil {
			result.PresencePenalty = openai.Float(float64(*config.PresencePenalty))
		}
		if config.FrequencyPenalty != nil {
			result.FrequencyPenalty = openai.Float(float64(*config.FrequencyPenalty))
		}
		if config.Seed != nil {
			result.Seed = openai.Int(int64(*config.Seed))
		}
		if config.ResponseJsonSchema != nil {
			schema, err := marshalSchema(config.ResponseJsonSchema)
			if err != nil {
				return openai.ChatCompletionNewParams{}, errors.New("encode response JSON schema")
			}
			result.ResponseFormat = openai.ChatCompletionNewParamsResponseFormatUnion{
				OfJSONSchema: &openai.ResponseFormatJSONSchemaParam{
					JSONSchema: shared.ResponseFormatJSONSchemaJSONSchemaParam{
						Name:   "response",
						Schema: schema,
						Strict: openai.Bool(true),
					},
				},
			}
		} else if config.ResponseSchema != nil {
			result.ResponseFormat = openai.ChatCompletionNewParamsResponseFormatUnion{
				OfJSONSchema: &openai.ResponseFormatJSONSchemaParam{
					JSONSchema: shared.ResponseFormatJSONSchemaJSONSchemaParam{
						Name:   "response",
						Schema: schemaMap(config.ResponseSchema),
					},
				},
			}
		} else if config.ResponseMIMEType == "application/json" {
			result.ResponseFormat = openai.ChatCompletionNewParamsResponseFormatUnion{
				OfJSONObject: &openai.ResponseFormatJSONObjectParam{},
			}
		}
		for _, tool := range config.Tools {
			if tool == nil {
				continue
			}
			for _, declaration := range tool.FunctionDeclarations {
				if declaration == nil || declaration.Name == "" {
					continue
				}
				var parameters shared.FunctionParameters
				if declaration.ParametersJsonSchema != nil {
					schema, schemaErr := marshalSchema(declaration.ParametersJsonSchema)
					if schemaErr != nil {
						return openai.ChatCompletionNewParams{}, fmt.Errorf("encode tool %q JSON schema", declaration.Name)
					}
					if err := json.Unmarshal(schema, &parameters); err != nil {
						return openai.ChatCompletionNewParams{}, fmt.Errorf("decode tool %q JSON schema", declaration.Name)
					}
					normalizeToolSchema(map[string]any(parameters))
				} else if declaration.Parameters != nil {
					if err := json.Unmarshal(schemaMap(declaration.Parameters), &parameters); err != nil {
						return openai.ChatCompletionNewParams{}, fmt.Errorf("decode tool %q parameters", declaration.Name)
					}
				}
				if parameters == nil {
					parameters = shared.FunctionParameters{"type": "object", "properties": shared.FunctionParameters{}}
				}
				result.Tools = append(result.Tools, openai.ChatCompletionFunctionTool(
					openai.FunctionDefinitionParam{
						Name:        declaration.Name,
						Description: openai.String(declaration.Description),
						Parameters:  parameters,
					},
				))
			}
		}
		if config.ToolConfig != nil && config.ToolConfig.FunctionCallingConfig != nil {
			calling := config.ToolConfig.FunctionCallingConfig
			switch calling.Mode {
			case genai.FunctionCallingConfigModeNone:
				result.ToolChoice = openai.ChatCompletionToolChoiceOptionUnionParam{
					OfAuto: openai.String("none"),
				}
			case genai.FunctionCallingConfigModeAny:
				if len(calling.AllowedFunctionNames) == 1 {
					result.ToolChoice = openai.ToolChoiceOptionFunctionToolChoice(
						openai.ChatCompletionNamedToolChoiceFunctionParam{Name: calling.AllowedFunctionNames[0]},
					)
				} else {
					result.ToolChoice = openai.ChatCompletionToolChoiceOptionUnionParam{
						OfAuto: openai.String("required"),
					}
				}
			case genai.FunctionCallingConfigModeAuto, genai.FunctionCallingConfigModeValidated:
				result.ToolChoice = openai.ChatCompletionToolChoiceOptionUnionParam{
					OfAuto: openai.String("auto"),
				}
			}
		}
	}
	for _, content := range req.Contents {
		msgs, err := contentMessages(content)
		if err != nil {
			return openai.ChatCompletionNewParams{}, err
		}
		result.Messages = append(result.Messages, msgs...)
	}
	return result, nil
}

func contentMessages(content *genai.Content) ([]openai.ChatCompletionMessageParamUnion, error) {
	if content == nil {
		return nil, nil
	}
	role := "user"
	if content.Role == "model" {
		role = "assistant"
	}
	var contentParts []openai.ChatCompletionContentPartUnionParam
	var toolMessages []openai.ChatCompletionMessageParamUnion
	for _, part := range content.Parts {
		if part == nil || part.Thought {
			continue
		}
		switch {
		case part.Text != "":
			contentParts = append(contentParts, openai.TextContentPart(part.Text))
		case part.InlineData != nil:
			if !strings.HasPrefix(part.InlineData.MIMEType, "image/") {
				return nil, errors.New("OpenAI-compatible adapter supports only inline images")
			}
			dataURI := fmt.Sprintf("data:%s;base64,%s", part.InlineData.MIMEType, part.InlineData.Data)
			contentParts = append(contentParts, openai.ImageContentPart(openai.ChatCompletionContentPartImageImageURLParam{
				URL: dataURI,
			}))
		case part.FunctionCall != nil:
			contentParts = append(contentParts, openai.TextContentPart("")) // placeholder; handled below
		case part.FunctionResponse != nil:
			encoded, err := json.Marshal(part.FunctionResponse.Response)
			if err != nil {
				return nil, errors.New("encode function response")
			}
			toolMessages = append(toolMessages, openai.ChatCompletionMessageParamUnion{
				OfTool: &openai.ChatCompletionToolMessageParam{
					Content:    openai.ChatCompletionToolMessageParamContentUnion{OfString: openai.String(string(encoded))},
					ToolCallID: part.FunctionResponse.ID,
				},
			})
		case len(part.ThoughtSignature) > 0:
			// A signature-only part with no accompanying text, image, or
			// function call/response carries nothing an OpenAI-compatible
			// provider can represent. ADK's cross-agent history conversion
			// (ConvertForeignEvent) passes non-text/non-function parts
			// through unmodified, and a thinking-enabled Gemini phase (e.g.
			// case_builder) can emit these bare signature parts alongside
			// its thought summary — which is already dropped above via
			// part.Thought. Dropping this one too is safe: it's an opaque
			// continuation marker for Gemini's own thinking, meaningless
			// once separated from that summary.
		default:
			return nil, errors.New("unsupported content part for OpenAI-compatible provider")
		}
	}
	var messages []openai.ChatCompletionMessageParamUnion
	switch {
	case role == "assistant" && len(content.Parts) > 0:
		msg := openai.ChatCompletionAssistantMessageParam{}
		var textParts []string
		for _, part := range content.Parts {
			if part == nil || part.Thought {
				continue
			}
			if part.Text != "" {
				textParts = append(textParts, part.Text)
			}
			if part.FunctionCall != nil {
				arguments, err := json.Marshal(part.FunctionCall.Args)
				if err != nil {
					return nil, errors.New("encode function call")
				}
				msg.ToolCalls = append(msg.ToolCalls, openai.ChatCompletionMessageToolCallUnionParam{
					OfFunction: &openai.ChatCompletionMessageFunctionToolCallParam{
						ID: part.FunctionCall.ID,
						Function: openai.ChatCompletionMessageFunctionToolCallFunctionParam{
							Name:      part.FunctionCall.Name,
							Arguments: string(arguments),
						},
					},
				})
			}
		}
		joined := strings.Join(textParts, "")
		if joined != "" {
			msg.Content = openai.ChatCompletionAssistantMessageParamContentUnion{
				OfString: openai.String(joined),
			}
		}
		messages = append(messages, openai.ChatCompletionMessageParamUnion{OfAssistant: &msg})
	case len(contentParts) == 1 && contentParts[0].OfText != nil:
		messages = append(messages, openai.UserMessage(contentParts[0].OfText.Text))
	case len(contentParts) > 0:
		messages = append(messages, openai.UserMessage(contentParts))
	}
	messages = append(messages, toolMessages...)
	return messages, nil
}

func textContent(content *genai.Content) (string, error) {
	var builder strings.Builder
	for _, part := range content.Parts {
		if part == nil || part.Thought {
			continue
		}
		if part.Text == "" {
			return "", errors.New("non-text part is unsupported")
		}
		builder.WriteString(part.Text)
	}
	return builder.String(), nil
}

func schemaMap(schema *genai.Schema) json.RawMessage {
	data, _ := json.Marshal(schema)
	var value any
	_ = json.Unmarshal(data, &value)
	normalizeSchema(value)
	data, _ = json.Marshal(value)
	return data
}

func marshalSchema(value any) (json.RawMessage, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	if !json.Valid(data) {
		return nil, errors.New("invalid JSON schema")
	}
	return data, nil
}

func normalizeSchema(value any) {
	switch value := value.(type) {
	case map[string]any:
		if kind, ok := value["type"].(string); ok {
			value["type"] = strings.ToLower(strings.TrimPrefix(kind, "TYPE_"))
		}
		for _, child := range value {
			normalizeSchema(child)
		}
	case []any:
		for _, child := range value {
			normalizeSchema(child)
		}
	}
}

// normalizeToolSchema applies the narrow compatibility transform required by
// OpenAI-compatible tool endpoints. jsonschema-go represents Go pointers,
// slices, and maps as unions such as ["null", "array"], which some providers
// reject for function parameters. Keep ADK's native schema everywhere else,
// especially response schemas where nullability is part of the contract.
func normalizeToolSchema(value any) {
	normalizeSchema(value)
	removeNullToolTypes(value)
}

func removeNullToolTypes(value any) {
	switch value := value.(type) {
	case map[string]any:
		if types, ok := value["type"].([]any); ok {
			nonNull := make([]any, 0, len(types))
			for _, schemaType := range types {
				if schemaType != "null" {
					nonNull = append(nonNull, schemaType)
				}
			}
			if len(nonNull) == 1 {
				value["type"] = nonNull[0]
			} else {
				value["type"] = nonNull
			}
		}
		for _, child := range value {
			removeNullToolTypes(child)
		}
	case []any:
		for _, child := range value {
			removeNullToolTypes(child)
		}
	}
}

func usageMetadata(usage openai.CompletionUsage) *genai.GenerateContentResponseUsageMetadata {
	return &genai.GenerateContentResponseUsageMetadata{
		PromptTokenCount:     int32(usage.PromptTokens),
		CandidatesTokenCount: int32(usage.CompletionTokens),
		TotalTokenCount:      int32(usage.TotalTokens),
	}
}

// reasoningChunk is used to re-parse raw JSON for reasoning_content fields
// that the official SDK does not expose on its typed structs.
type reasoningChunk struct {
	Choices []struct {
		Delta struct {
			ReasoningContent string `json:"reasoning_content"`
			Reasoning        string `json:"reasoning"`
		} `json:"delta"`
	} `json:"choices"`
	Message struct {
		ReasoningContent string `json:"reasoning_content"`
		Reasoning        string `json:"reasoning"`
	} `json:"message"`
}

// extractReasoning re-parses raw JSON from the SDK to extract
// reasoning_content or reasoning fields not in the typed structs.
func extractReasoning(rawJSON string) string {
	if rawJSON == "" {
		return ""
	}
	var rc reasoningChunk
	if json.Unmarshal([]byte(rawJSON), &rc) != nil {
		return ""
	}
	if len(rc.Choices) > 0 {
		if rc.Choices[0].Delta.ReasoningContent != "" {
			return rc.Choices[0].Delta.ReasoningContent
		}
		if rc.Choices[0].Delta.Reasoning != "" {
			return rc.Choices[0].Delta.Reasoning
		}
	}
	if rc.Message.ReasoningContent != "" {
		return rc.Message.ReasoningContent
	}
	if rc.Message.Reasoning != "" {
		return rc.Message.Reasoning
	}
	return ""
}

func finishReason(reason string) genai.FinishReason {
	switch reason {
	case "stop", "tool_calls", "function_call":
		return genai.FinishReasonStop
	case "length":
		return genai.FinishReasonMaxTokens
	case "content_filter":
		return genai.FinishReasonSafety
	default:
		return genai.FinishReasonUnspecified
	}
}
