package main

import (
	"context"
	"encoding/json/jsontext"
	json "encoding/json/v2"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/aranlucas/agents/internal/agentruntime"
	"github.com/aranlucas/agents/internal/config"
	"github.com/aranlucas/agents/internal/providerpolicy"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/runner"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/session/compaction"
	"google.golang.org/genai"
)

// RecallReport records synthetic early-fact recall after repeated compaction.
type RecallReport struct {
	Provider      string   `json:"provider"`
	Strategy      string   `json:"strategy"`
	Notes         []string `json:"notes,omitempty"`
	FactsTotal    int      `json:"facts_total"`
	FactsRetained int      `json:"facts_retained"`
	Missing       []string `json:"missing,omitempty"`
	Summaries     int      `json:"summaries"`
	Passed        bool     `json:"passed"`
	FinalText     string   `json:"final_text"`
	SummaryTexts  []string `json:"summary_texts"`
}

func runRecall(ctx context.Context, providers map[string]config.Provider, providerName, strategy string) (RecallReport, error) {
	if strategy != "sliding" && strategy != "rolling" {
		return RecallReport{}, fmt.Errorf("unsupported recall strategy %q", strategy)
	}
	workload := providerpolicy.Grocery
	if providerName == "openrouter" {
		workload = providerpolicy.Research
	} else if providerName != "groq" {
		return RecallReport{}, fmt.Errorf("unsupported recall provider %q", providerName)
	}
	policy, err := providerpolicy.Agent(workload)
	if err != nil {
		return RecallReport{}, err
	}
	var notes []string
	m, err := newModel(providers, policy, &notes)
	if err != nil {
		return RecallReport{}, err
	}
	built, err := llmagent.New(llmagent.Config{
		Name: "compaction_recall", Model: m,
		Instruction: "Follow the user's instructions. Preserve their exact reference facts and codes. Keep acknowledgments brief. Treat filler messages as narrative, not new durable facts.",
	})
	if err != nil {
		return RecallReport{}, err
	}
	sessions := session.InMemoryService()
	cfg := agentruntime.DefaultCompaction()
	// Lower the trigger to exercise several summaries in a short eval.
	cfg.CompactionInterval = 2
	if strategy == "rolling" {
		cfg = &compaction.Config{TokenThreshold: 1_000, EventRetentionSize: 2}
	}
	rn, err := runner.New(runner.Config{AppName: built.Name(), Agent: built, SessionService: sessions, AutoCreateSession: true, Compaction: cfg})
	if err != nil {
		return RecallReport{}, err
	}
	facts := []string{"MAPLE-483", "Coimbra", "2371 USD", "2031-04-17", "RG-9028", "six travelers", "room 314", "train only"}
	report := RecallReport{Provider: m.Name(), Strategy: strategy, Notes: notes, FactsTotal: len(facts)}
	for turn := range 12 {
		prompt := "This is filler narrative for a memory evaluation. Acknowledge with one word. " + strings.Repeat("The scenery changes as the conversation wanders, and we continue exploring possibilities without changing the reference facts. ", 35)
		if turn == 0 {
			prompt = "Remember these eight reference facts exactly: " + strings.Join(facts, "; ") + ". Reply only with Acknowledged."
		}
		if turn == 11 {
			prompt = "List the eight reference facts from the first message verbatim, including every code and number. Do not add commentary."
		}
		for event, err := range rn.Run(ctx, "recall-user", "recall-thread", genai.NewContentFromText(prompt, genai.RoleUser), agent.RunConfig{}) {
			if errors.Is(err, compaction.ErrCompaction) {
				report.Notes = append(report.Notes, err.Error())
				continue
			}
			if err != nil {
				return report, err
			}
			if turn == 11 && event.Content != nil {
				for _, part := range event.Content.Parts {
					if part != nil && !part.Thought {
						report.FinalText += part.Text
					}
				}
			}
		}
	}
	stored, err := sessions.Get(ctx, &session.GetRequest{AppName: built.Name(), UserID: "recall-user", SessionID: "recall-thread"})
	if err != nil {
		return report, err
	}
	for event := range stored.Session.Events().All() {
		if event.Actions.Compaction != nil {
			report.Summaries++
			if content := event.Actions.Compaction.CompactedContent; content != nil {
				var summary strings.Builder
				for _, part := range content.Parts {
					if part != nil && !part.Thought {
						summary.WriteString(part.Text)
					}
				}
				report.SummaryTexts = append(report.SummaryTexts, summary.String())
			}
		}
	}
	for _, fact := range facts {
		if strings.Contains(report.FinalText, fact) {
			report.FactsRetained++
		} else {
			report.Missing = append(report.Missing, fact)
		}
	}
	report.Passed = report.FactsRetained == len(facts) && report.Summaries >= 2
	return report, nil
}

func saveRecallReport(report RecallReport) error {
	path := filepath.Join("artifacts", "recall", "results_"+report.Strategy+".json")
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return err
	}
	encoded, err := json.Marshal(report, jsontext.Multiline(true), jsontext.WithIndent("  "))
	if err != nil {
		return err
	}
	return os.WriteFile(path, encoded, 0o600)
}
