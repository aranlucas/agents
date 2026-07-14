package agui

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

const sessionTitleInstruction = `Create a concise, specific 3-5 word title that summarizes the user's message.
Do not answer or otherwise interact with the message.
For a simple greeting, return Greeting.`

var sessionTitleSchema = &genai.Schema{
	Type: genai.TypeObject,
	Properties: map[string]*genai.Schema{
		"title": {
			Type:        genai.TypeString,
			Description: "A concise, specific 3-5 word session title without quotes, labels, emoji, or Markdown.",
		},
	},
	Required: []string{"title"},
}

type sessionTitleResponse struct {
	Title string `json:"title"`
}

func generateSessionName(ctx context.Context, titleModel model.LLM, prompt string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	request := &model.LLMRequest{
		Contents: genai.Text(truncateRunes(prompt, 2000)),
		Config: &genai.GenerateContentConfig{
			SystemInstruction: &genai.Content{Parts: []*genai.Part{{Text: sessionTitleInstruction}}},
			Temperature:       genai.Ptr(float32(0.2)),
			MaxOutputTokens:   20,
			ResponseMIMEType:  "application/json",
			ResponseSchema:    sessionTitleSchema,
		},
	}
	var output strings.Builder
	for response, err := range titleModel.GenerateContent(ctx, request, false) {
		if err != nil {
			return "", err
		}
		if response == nil || response.Content == nil {
			continue
		}
		for _, part := range response.Content.Parts {
			if part != nil && !part.Thought {
				output.WriteString(part.Text)
			}
		}
	}
	var response sessionTitleResponse
	if err := json.Unmarshal([]byte(output.String()), &response); err != nil {
		return "", errors.New("title model returned invalid JSON")
	}
	title := cleanSessionName(response.Title)
	if title == "" {
		return "", errors.New("title model returned no text")
	}
	return title, nil
}

func cleanSessionName(value string) string {
	words := strings.Fields(value)
	if len(words) > 5 {
		words = words[:5]
	}
	return truncateSessionName(strings.Join(words, " "))
}

func truncateSessionName(value string) string {
	return truncateRunes(value, 64)
}

func truncateRunes(value string, maximum int) string {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) <= maximum {
		return string(runes)
	}
	return strings.TrimSpace(string(runes[:maximum-1])) + "…"
}
