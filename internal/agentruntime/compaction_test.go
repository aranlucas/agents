package agentruntime_test

import (
	"context"
	json "encoding/json/v2"
	"iter"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aranlucas/agents/internal/agentruntime"
	"github.com/aranlucas/agents/internal/storage"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/runner"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/session/compaction"
	"google.golang.org/genai"
)

// This fixture checks the integration contract, including repeated summary
// replacement and SQLite round trips. Model quality needs a live recall eval.
type recallModel struct {
	t               *testing.T
	facts           []string
	summaries       int
	lastPromptBytes int
}

func (*recallModel) Name() string { return "recall-fixture" }
func (m *recallModel) GenerateContent(_ context.Context, req *model.LLMRequest, _ bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		encoded, err := json.Marshal(req)
		if err != nil {
			m.t.Fatal(err)
		}
		text := string(encoded)
		answer := "Recorded."
		if req.Config == nil || req.Config.SystemInstruction == nil {
			if !strings.Contains(text, "Durable facts") {
				m.t.Error("default summarizer omitted durable-fact instructions")
			}
			m.summaries++
			var retained []string
			for _, fact := range m.facts {
				if strings.Contains(text, fact) {
					retained = append(retained, fact)
				}
			}
			answer = "Durable facts: " + strings.Join(retained, "; ")
		} else {
			m.lastPromptBytes = len(encoded)
			if !strings.Contains(text, "canonical-constraint-42") {
				m.t.Error("compaction removed structured state")
			}
			last := req.Contents[len(req.Contents)-1]
			if strings.Contains(last.Parts[0].Text, "recall now") {
				for _, fact := range m.facts {
					if !strings.Contains(text, fact) {
						m.t.Errorf("lost durable fact %q", fact)
					}
				}
				answer = strings.Join(m.facts, "; ")
			}
		}
		yield(&model.LLMResponse{Content: genai.NewContentFromText(answer, genai.RoleModel), TurnComplete: true}, nil)
	}
}

func TestCompactionRetainsFactsStateAndSQLiteHistory(t *testing.T) {
	for _, strategy := range []string{"sliding", "rolling"} {
		t.Run(strategy, func(t *testing.T) { testCompactionRecall(t, strategy) })
	}
}

func testCompactionRecall(t *testing.T, strategy string) {
	db, err := storage.Open(filepath.Join(t.TempDir(), "agents.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.Migrate(t.Context()); err != nil {
		t.Fatal(err)
	}
	sessions, err := db.NewSessionService()
	if err != nil {
		t.Fatal(err)
	}
	facts := []string{"Lisbon", "November 12-15 2026", "two travelers", "budget 2345", "train only", "quiet hotel", "reference ZX-918", "vegetarian meals"}
	m := &recallModel{t: t, facts: facts}
	built, err := llmagent.New(llmagent.Config{Name: "recall_fixture", Model: m, Instruction: "Structured constraint: {critical_constraint}"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := sessions.Create(t.Context(), &session.CreateRequest{AppName: built.Name(), UserID: "user", SessionID: "thread", State: map[string]any{"critical_constraint": "canonical-constraint-42"}}); err != nil {
		t.Fatal(err)
	}
	summarizer, err := compaction.NewLLMSummarizer(compaction.LLMSummarizerConfig{Model: m})
	if err != nil {
		t.Fatal(err)
	}
	cfg := agentruntime.DefaultCompaction()
	cfg.CompactionInterval, cfg.Summarizer = 4, summarizer
	if strategy == "rolling" {
		cfg = &compaction.Config{TokenThreshold: 1_000, EventRetentionSize: 4, Summarizer: summarizer}
	}
	rn, err := runner.New(runner.Config{AppName: built.Name(), Agent: built, SessionService: sessions, Compaction: cfg})
	if err != nil {
		t.Fatal(err)
	}
	first := strings.Join(facts, "; ")
	for turn := range 26 {
		prompt := strings.Repeat("ordinary planning details ", 45)
		if turn == 0 {
			prompt = first
		}
		if turn == 25 {
			prompt = "recall now"
		}
		for _, err := range rn.Run(t.Context(), "user", "thread", genai.NewContentFromText(prompt, genai.RoleUser), agent.RunConfig{}) {
			if err != nil {
				t.Fatal(err)
			}
		}
	}
	if m.summaries < 3 {
		t.Fatalf("only %d summarizations; repeated compaction was not exercised", m.summaries)
	}
	if m.lastPromptBytes > 8_000 {
		t.Fatalf("history did not shrink: final request has %d bytes", m.lastPromptBytes)
	}
	stored, err := sessions.Get(t.Context(), &session.GetRequest{AppName: built.Name(), UserID: "user", SessionID: "thread"})
	if err != nil {
		t.Fatal(err)
	}
	userEvents, originalFound := 0, false
	for event := range stored.Session.Events().All() {
		if event.Author == "user" && event.Actions.Compaction == nil {
			userEvents++
			if event.Content != nil && event.Content.Parts[0].Text == first {
				originalFound = true
			}
		}
	}
	if userEvents != 26 || !originalFound {
		t.Fatalf("original history was lost: %d user events, original=%v", userEvents, originalFound)
	}
	if value, err := stored.Session.State().Get("critical_constraint"); err != nil || value != "canonical-constraint-42" {
		t.Fatalf("structured state = %v, %v", value, err)
	}
}
