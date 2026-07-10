package openai

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"google.golang.org/adk/model"
	"google.golang.org/genai"
)

type chatRequest struct {
	Model            string        `json:"model"`
	Messages         []chatMessage `json:"messages"`
	Tools            []chatTool    `json:"tools,omitempty"`
	ToolChoice       any           `json:"tool_choice,omitempty"`
	Temperature      *float32      `json:"temperature,omitempty"`
	TopP             *float32      `json:"top_p,omitempty"`
	MaxTokens        int32         `json:"max_tokens,omitempty"`
	Stop             []string      `json:"stop,omitempty"`
	PresencePenalty  *float32      `json:"presence_penalty,omitempty"`
	FrequencyPenalty *float32      `json:"frequency_penalty,omitempty"`
	Seed             *int32        `json:"seed,omitempty"`
	ResponseFormat   any           `json:"response_format,omitempty"`
	Stream           bool          `json:"stream"`
	StreamOptions    any           `json:"stream_options,omitempty"`
}

type chatMessage struct {
	Role       string         `json:"role"`
	Content    any            `json:"content,omitempty"`
	ToolCalls  []chatToolCall `json:"tool_calls,omitempty"`
	ToolCallID string         `json:"tool_call_id,omitempty"`
	Name       string         `json:"name,omitempty"`
}

type contentPart struct {
	Type     string         `json:"type"`
	Text     string         `json:"text,omitempty"`
	ImageURL *imageURLValue `json:"image_url,omitempty"`
}

type imageURLValue struct {
	URL string `json:"url"`
}

type chatTool struct {
	Type     string       `json:"type"`
	Function chatFunction `json:"function"`
}

type chatFunction struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Parameters  any    `json:"parameters"`
}

type chatToolCall struct {
	Index    int              `json:"index,omitempty"`
	ID       string           `json:"id,omitempty"`
	Type     string           `json:"type,omitempty"`
	Function chatFunctionCall `json:"function"`
}

type chatFunctionCall struct {
	Name      string `json:"name,omitempty"`
	Arguments string `json:"arguments,omitempty"`
}

type chatResponse struct {
	ID      string       `json:"id"`
	Model   string       `json:"model"`
	Choices []chatChoice `json:"choices"`
	Usage   *chatUsage   `json:"usage,omitempty"`
}

type chatChoice struct {
	Index        int       `json:"index"`
	Message      chatDelta `json:"message"`
	Delta        chatDelta `json:"delta"`
	FinishReason string    `json:"finish_reason"`
}

type chatDelta struct {
	Role             string         `json:"role,omitempty"`
	Content          string         `json:"content,omitempty"`
	ReasoningContent string         `json:"reasoning_content,omitempty"`
	Reasoning        string         `json:"reasoning,omitempty"`
	ToolCalls        []chatToolCall `json:"tool_calls,omitempty"`
}

type chatUsage struct {
	PromptTokens     int32 `json:"prompt_tokens"`
	CompletionTokens int32 `json:"completion_tokens"`
	TotalTokens      int32 `json:"total_tokens"`
}

func buildChatRequest(req *model.LLMRequest, modelName string, stream bool) (chatRequest, error) {
	if req == nil {
		return chatRequest{}, errors.New("LLM request is required")
	}
	if strings.TrimSpace(modelName) == "" {
		return chatRequest{}, errors.New("provider model is required")
	}
	result := chatRequest{Model: modelName, Stream: stream}
	if stream {
		result.StreamOptions = map[string]bool{"include_usage": true}
	}
	if req.Config != nil {
		config := req.Config
		if config.SystemInstruction != nil {
			content, err := textContent(config.SystemInstruction)
			if err != nil {
				return chatRequest{}, fmt.Errorf("system instruction: %w", err)
			}
			if content != "" {
				result.Messages = append(result.Messages, chatMessage{Role: "system", Content: content})
			}
		}
		result.Temperature, result.TopP, result.MaxTokens = config.Temperature, config.TopP, config.MaxOutputTokens
		result.Stop, result.PresencePenalty, result.FrequencyPenalty, result.Seed = config.StopSequences, config.PresencePenalty, config.FrequencyPenalty, config.Seed
		if config.ResponseJsonSchema != nil {
			result.ResponseFormat = map[string]any{"type": "json_schema", "json_schema": map[string]any{"name": "response", "schema": config.ResponseJsonSchema}}
		} else if config.ResponseSchema != nil {
			result.ResponseFormat = map[string]any{"type": "json_schema", "json_schema": map[string]any{"name": "response", "schema": schemaMap(config.ResponseSchema)}}
		} else if config.ResponseMIMEType == "application/json" {
			result.ResponseFormat = map[string]string{"type": "json_object"}
		}
		for _, tool := range config.Tools {
			if tool == nil {
				continue
			}
			for _, declaration := range tool.FunctionDeclarations {
				if declaration == nil || declaration.Name == "" {
					continue
				}
				parameters := declaration.ParametersJsonSchema
				if parameters == nil && declaration.Parameters != nil {
					parameters = schemaMap(declaration.Parameters)
				}
				if parameters == nil {
					parameters = map[string]any{"type": "object", "properties": map[string]any{}}
				}
				result.Tools = append(result.Tools, chatTool{Type: "function", Function: chatFunction{Name: declaration.Name, Description: declaration.Description, Parameters: parameters}})
			}
		}
		if config.ToolConfig != nil && config.ToolConfig.FunctionCallingConfig != nil {
			calling := config.ToolConfig.FunctionCallingConfig
			switch calling.Mode {
			case genai.FunctionCallingConfigModeNone:
				result.ToolChoice = "none"
			case genai.FunctionCallingConfigModeAny:
				if len(calling.AllowedFunctionNames) == 1 {
					result.ToolChoice = map[string]any{"type": "function", "function": map[string]string{"name": calling.AllowedFunctionNames[0]}}
				} else {
					result.ToolChoice = "required"
				}
			case genai.FunctionCallingConfigModeAuto, genai.FunctionCallingConfigModeValidated:
				result.ToolChoice = "auto"
			}
		}
	}
	for _, content := range req.Contents {
		messages, err := contentMessages(content)
		if err != nil {
			return chatRequest{}, err
		}
		result.Messages = append(result.Messages, messages...)
	}
	if len(result.Messages) == 0 {
		result.Messages = append(result.Messages, chatMessage{Role: "user", Content: "Continue processing the request as instructed."})
	}
	return result, nil
}

func contentMessages(content *genai.Content) ([]chatMessage, error) {
	if content == nil {
		return nil, nil
	}
	role := "user"
	if content.Role == "model" {
		role = "assistant"
	}
	message := chatMessage{Role: role}
	var parts []contentPart
	var responses []chatMessage
	for _, part := range content.Parts {
		if part == nil || part.Thought {
			continue
		}
		switch {
		case part.Text != "":
			parts = append(parts, contentPart{Type: "text", Text: part.Text})
		case part.InlineData != nil:
			if !strings.HasPrefix(part.InlineData.MIMEType, "image/") {
				return nil, errors.New("OpenAI-compatible adapter supports only inline images")
			}
			parts = append(parts, contentPart{Type: "image_url", ImageURL: &imageURLValue{URL: "data:" + part.InlineData.MIMEType + ";base64," + base64.StdEncoding.EncodeToString(part.InlineData.Data)}})
		case part.FunctionCall != nil:
			arguments, err := json.Marshal(part.FunctionCall.Args)
			if err != nil {
				return nil, errors.New("encode function call")
			}
			message.ToolCalls = append(message.ToolCalls, chatToolCall{ID: part.FunctionCall.ID, Type: "function", Function: chatFunctionCall{Name: part.FunctionCall.Name, Arguments: string(arguments)}})
		case part.FunctionResponse != nil:
			encoded, err := json.Marshal(part.FunctionResponse.Response)
			if err != nil {
				return nil, errors.New("encode function response")
			}
			responses = append(responses, chatMessage{Role: "tool", ToolCallID: part.FunctionResponse.ID, Name: part.FunctionResponse.Name, Content: string(encoded)})
		default:
			return nil, errors.New("unsupported content part for OpenAI-compatible provider")
		}
	}
	if len(parts) == 1 && parts[0].Type == "text" {
		message.Content = parts[0].Text
	} else if len(parts) > 0 {
		message.Content = parts
	}
	var messages []chatMessage
	if message.Content != nil || len(message.ToolCalls) > 0 {
		messages = append(messages, message)
	}
	messages = append(messages, responses...)
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

func schemaMap(schema *genai.Schema) any {
	data, _ := json.Marshal(schema)
	var value any
	_ = json.Unmarshal(data, &value)
	normalizeSchema(value)
	return value
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

func usageMetadata(usage *chatUsage) *genai.GenerateContentResponseUsageMetadata {
	if usage == nil {
		return nil
	}
	return &genai.GenerateContentResponseUsageMetadata{PromptTokenCount: usage.PromptTokens, CandidatesTokenCount: usage.CompletionTokens, TotalTokenCount: usage.TotalTokens}
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
