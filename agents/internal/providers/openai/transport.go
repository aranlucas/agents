package openai

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

type chatRequest struct {
	Model            string          `json:"model"`
	Messages         []chatMessage   `json:"messages"`
	Tools            []chatTool      `json:"tools,omitempty"`
	ToolChoice       *toolChoice     `json:"tool_choice,omitempty"`
	Temperature      *float32        `json:"temperature,omitempty"`
	TopP             *float32        `json:"top_p,omitempty"`
	MaxTokens        int32           `json:"max_tokens,omitempty"`
	Stop             []string        `json:"stop,omitempty"`
	PresencePenalty  *float32        `json:"presence_penalty,omitempty"`
	FrequencyPenalty *float32        `json:"frequency_penalty,omitempty"`
	Seed             *int32          `json:"seed,omitempty"`
	ResponseFormat   *responseFormat `json:"response_format,omitempty"`
	Stream           bool            `json:"stream"`
	StreamOptions    *streamOptions  `json:"stream_options,omitempty"`
}

type streamOptions struct {
	IncludeUsage bool `json:"include_usage"`
}

type responseFormat struct {
	Type       string              `json:"type"`
	JSONSchema *responseJSONSchema `json:"json_schema,omitempty"`
}

type responseJSONSchema struct {
	Name   string          `json:"name"`
	Schema json.RawMessage `json:"schema"`
}

// toolChoice models OpenAI's string-or-object wire union without leaking an
// untyped value through the rest of the adapter.
type toolChoice struct {
	Mode         string
	FunctionName string
}

func (c toolChoice) MarshalJSON() ([]byte, error) {
	if c.FunctionName == "" {
		return json.Marshal(c.Mode)
	}
	return json.Marshal(struct {
		Type     string `json:"type"`
		Function struct {
			Name string `json:"name"`
		} `json:"function"`
	}{Type: "function", Function: struct {
		Name string `json:"name"`
	}{Name: c.FunctionName}})
}

type chatMessage struct {
	Role       string         `json:"role"`
	Content    *chatContent   `json:"content,omitempty"`
	ToolCalls  []chatToolCall `json:"tool_calls,omitempty"`
	ToolCallID string         `json:"tool_call_id,omitempty"`
	Name       string         `json:"name,omitempty"`
}

// chatContent models OpenAI's string-or-array message content union.
type chatContent struct {
	Text  *string
	Parts []contentPart
}

func textChatContent(value string) *chatContent { return &chatContent{Text: &value} }

func (c chatContent) MarshalJSON() ([]byte, error) {
	if c.Text != nil {
		return json.Marshal(*c.Text)
	}
	return json.Marshal(c.Parts)
}

func (c *chatContent) UnmarshalJSON(data []byte) error {
	var text string
	if err := json.Unmarshal(data, &text); err == nil {
		c.Text = &text
		c.Parts = nil
		return nil
	}
	var parts []contentPart
	if err := json.Unmarshal(data, &parts); err != nil {
		return err
	}
	c.Text = nil
	c.Parts = parts
	return nil
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
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	Parameters  json.RawMessage `json:"parameters"`
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
		result.StreamOptions = &streamOptions{IncludeUsage: true}
	}
	if req.Config != nil {
		config := req.Config
		if config.SystemInstruction != nil {
			content, err := textContent(config.SystemInstruction)
			if err != nil {
				return chatRequest{}, fmt.Errorf("system instruction: %w", err)
			}
			if content != "" {
				result.Messages = append(result.Messages, chatMessage{Role: "system", Content: textChatContent(content)})
			}
		}
		result.Temperature, result.TopP, result.MaxTokens = config.Temperature, config.TopP, config.MaxOutputTokens
		result.Stop, result.PresencePenalty, result.FrequencyPenalty, result.Seed = config.StopSequences, config.PresencePenalty, config.FrequencyPenalty, config.Seed
		if config.ResponseJsonSchema != nil {
			schema, err := marshalSchema(config.ResponseJsonSchema)
			if err != nil {
				return chatRequest{}, errors.New("encode response JSON schema")
			}
			result.ResponseFormat = &responseFormat{Type: "json_schema", JSONSchema: &responseJSONSchema{Name: "response", Schema: schema}}
		} else if config.ResponseSchema != nil {
			result.ResponseFormat = &responseFormat{Type: "json_schema", JSONSchema: &responseJSONSchema{Name: "response", Schema: schemaMap(config.ResponseSchema)}}
		} else if config.ResponseMIMEType == "application/json" {
			result.ResponseFormat = &responseFormat{Type: "json_object"}
		}
		for _, tool := range config.Tools {
			if tool == nil {
				continue
			}
			for _, declaration := range tool.FunctionDeclarations {
				if declaration == nil || declaration.Name == "" {
					continue
				}
				var parameters json.RawMessage
				if declaration.ParametersJsonSchema != nil {
					var schemaErr error
					parameters, schemaErr = marshalSchema(declaration.ParametersJsonSchema)
					if schemaErr != nil {
						return chatRequest{}, fmt.Errorf("encode tool %q JSON schema", declaration.Name)
					}
				} else if declaration.Parameters != nil {
					parameters = schemaMap(declaration.Parameters)
				}
				if parameters == nil {
					parameters = json.RawMessage(`{"type":"object","properties":{}}`)
				}
				result.Tools = append(result.Tools, chatTool{Type: "function", Function: chatFunction{Name: declaration.Name, Description: declaration.Description, Parameters: parameters}})
			}
		}
		if config.ToolConfig != nil && config.ToolConfig.FunctionCallingConfig != nil {
			calling := config.ToolConfig.FunctionCallingConfig
			switch calling.Mode {
			case genai.FunctionCallingConfigModeNone:
				result.ToolChoice = &toolChoice{Mode: "none"}
			case genai.FunctionCallingConfigModeAny:
				if len(calling.AllowedFunctionNames) == 1 {
					result.ToolChoice = &toolChoice{FunctionName: calling.AllowedFunctionNames[0]}
				} else {
					result.ToolChoice = &toolChoice{Mode: "required"}
				}
			case genai.FunctionCallingConfigModeAuto, genai.FunctionCallingConfigModeValidated:
				result.ToolChoice = &toolChoice{Mode: "auto"}
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
		result.Messages = append(result.Messages, chatMessage{Role: "user", Content: textChatContent("Continue processing the request as instructed.")})
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
			responses = append(responses, chatMessage{Role: "tool", ToolCallID: part.FunctionResponse.ID, Name: part.FunctionResponse.Name, Content: textChatContent(string(encoded))})
		default:
			return nil, errors.New("unsupported content part for OpenAI-compatible provider")
		}
	}
	if len(parts) == 1 && parts[0].Type == "text" {
		message.Content = textChatContent(parts[0].Text)
	} else if len(parts) > 0 {
		message.Content = &chatContent{Parts: parts}
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
