package agui

import (
	"context"
	"errors"
	"iter"
	"strings"
	"testing"

	"agents/internal/agentruntime"
	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/types"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

type titleModel struct {
	response string
	err      error
	request  *model.LLMRequest
	calls    int
}

func (m *titleModel) Name() string { return "title-model" }

func (m *titleModel) GenerateContent(_ context.Context, request *model.LLMRequest, _ bool) iter.Seq2[*model.LLMResponse, error] {
	m.calls++
	m.request = request
	return func(yield func(*model.LLMResponse, error) bool) {
		if m.err != nil {
			yield(nil, m.err)
			return
		}
		yield(&model.LLMResponse{Content: genai.NewContentFromText(m.response, genai.RoleModel)}, nil)
	}
}

func TestRestoreSessionDoesNotRetitleExistingSession(t *testing.T) {
	sessions := newFakeSessionService()
	entry := agentruntime.Entry{Route: "travel", AppName: "travel_agent", StateDefaults: func() map[string]any { return nil }}
	existing, err := sessions.Create(t.Context(), &session.CreateRequest{
		AppName:   entry.AppName,
		UserID:    "user-1",
		SessionID: "thread-1",
		State:     map[string]any{sessionNameStateKey: "Existing title"},
	})
	if err != nil {
		t.Fatal(err)
	}
	titles := &titleModel{response: `{"title":"Replacement title"}`}
	handler := &ADKHandler{sessions: sessions, titles: titles}

	restored, err := handler.restoreSession(t.Context(), entry, "user-1", "thread-1", &types.RunAgentInput{
		Messages: []types.Message{{Role: types.RoleUser, Content: "A completely different request"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if restored.ID() != existing.Session.ID() {
		t.Fatalf("restored session = %q, want %q", restored.ID(), existing.Session.ID())
	}
	if titles.calls != 0 {
		t.Fatalf("title model calls = %d, want 0", titles.calls)
	}
}

func TestRestoreSessionGeneratesTitleFromFirstUserMessage(t *testing.T) {
	sessions := newFakeSessionService()
	titles := &titleModel{response: `{"title":"Tokyo Family Adventure"}`}
	handler := &ADKHandler{sessions: sessions, titles: titles}
	entry := agentruntime.Entry{Route: "travel", AppName: "travel_agent", StateDefaults: func() map[string]any { return nil }}
	created, err := handler.restoreSession(t.Context(), entry, "user-1", "thread-1", &types.RunAgentInput{Messages: []types.Message{
		{Role: types.RoleUser, Content: "Plan a family trip to Tokyo in April"},
		{Role: types.RoleAssistant, Content: "Sure"},
		{Role: types.RoleUser, Content: "Make it five days"},
	}})
	if err != nil {
		t.Fatal(err)
	}
	name, err := created.State().Get(sessionNameStateKey)
	if err != nil || name != "Tokyo Family Adventure" {
		t.Fatalf("session name = %#v, err = %v", name, err)
	}
	if titles.request == nil || titles.request.Config == nil || titles.request.Config.MaxOutputTokens != 20 {
		t.Fatalf("title request = %#v", titles.request)
	}
	if titles.request.Config.ResponseMIMEType != "application/json" || titles.request.Config.ResponseSchema != sessionTitleSchema {
		t.Fatalf("title response schema = %#v", titles.request.Config.ResponseSchema)
	}
	if got := titles.request.Contents[0].Parts[0].Text; got != "Plan a family trip to Tokyo in April" {
		t.Fatalf("title prompt = %q", got)
	}
}

func TestRestoreSessionFallsBackWhenTitleModelFails(t *testing.T) {
	sessions := newFakeSessionService()
	handler := &ADKHandler{sessions: sessions, titles: &titleModel{err: errors.New("unavailable")}}
	entry := agentruntime.Entry{Route: "travel", AppName: "travel_agent", StateDefaults: func() map[string]any { return nil }}
	prompt := strings.Repeat("a", 70)
	created, err := handler.restoreSession(t.Context(), entry, "user-1", "thread-1", &types.RunAgentInput{
		Messages: []types.Message{{Role: types.RoleUser, Content: prompt}},
	})
	if err != nil {
		t.Fatal(err)
	}
	name, _ := created.State().Get(sessionNameStateKey)
	if name != strings.Repeat("a", 63)+"…" {
		t.Fatalf("fallback session name = %q", name)
	}
}

func TestCleanSessionNameBoundsModelOutput(t *testing.T) {
	if got := cleanSessionName("Plan an affordable family trip to Japan"); got != "Plan an affordable family trip" {
		t.Fatalf("cleanSessionName() = %q", got)
	}
}
