package jobs

import (
	"errors"

	"github.com/aranlucas/agents/internal/bravesearch"
	"github.com/aranlucas/agents/internal/common"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
	"google.golang.org/genai"
)

type ReadJobPostingArgs struct {
	URL string `json:"url"`
}

// New builds the authenticated job-matching and application-drafting agent.
func New(m model.LLM, search *bravesearch.Client, loader *common.WebLoader, toolsets ...tool.Toolset) (agent.Agent, error) {
	tools, err := jobsTools(search, loader)
	if err != nil {
		return nil, err
	}
	return llmagent.New(llmagent.Config{
		Name:        AppName,
		Description: "Research and rank current jobs, assess fit, and propose truthful tailored resumes for Lucas.",
		Instruction: Instruction,
		Model:       m,
		GenerateContentConfig: &genai.GenerateContentConfig{
			MaxOutputTokens: 4096,
		},
		BeforeAgentCallbacks: []agent.BeforeAgentCallback{hydrateJobsUserState},
		Tools:                tools,
		Toolsets:             toolsets,
	})
}

func jobsTools(search *bravesearch.Client, loader *common.WebLoader) ([]tool.Tool, error) {
	saveProfileTool, err := functiontool.New(functiontool.Config{
		Name:        "save_application_profile",
		Description: "Save only application facts and voice notes explicitly provided by the user.",
	}, SaveApplicationProfile)
	if err != nil {
		return nil, err
	}
	saveWatchlistTool, err := functiontool.New(functiontool.Config{
		Name:        "save_job_watchlist",
		Description: "Save the authenticated user's durable job-search preferences and reset the stale inbox.",
	}, SaveJobWatchlist)
	if err != nil {
		return nil, err
	}
	writeInboxTool, err := functiontool.New(functiontool.Config{
		Name:        "write_ranked_job_inbox",
		Description: "Deduplicate, score, and persist current job candidates in descending fit order.",
	}, WriteRankedJobInbox)
	if err != nil {
		return nil, err
	}
	updateCandidateTool, err := functiontool.New(functiontool.Config{
		Name:        "update_job_candidate",
		Description: "Shortlist, dismiss, or restore one job candidate when the user explicitly asks.",
	}, UpdateJobCandidate)
	if err != nil {
		return nil, err
	}
	setTargetJobTool, err := functiontool.New(functiontool.Config{
		Name:        "set_target_job",
		Description: "Capture the target company, title, URL, and job description and reset stale work.",
	}, SetTargetJob)
	if err != nil {
		return nil, err
	}
	writeMatchTool, err := functiontool.New(functiontool.Config{
		Name:        "write_match_assessment",
		Description: "Write an evidence-grounded match score, verdict, strengths, and gaps.",
	}, WriteMatchAssessment)
	if err != nil {
		return nil, err
	}
	writeResearchTool, err := functiontool.New(functiontool.Config{
		Name:        "write_job_research",
		Description: "Save a concise company and role research brief with its public HTTPS sources.",
	}, WriteJobResearch)
	if err != nil {
		return nil, err
	}
	writeTailoredResumeTool, err := functiontool.New(functiontool.Config{
		Name:        "write_tailored_resume",
		Description: "Write a complete proposed resume tailored only from documented evidence.",
	}, WriteTailoredResume)
	if err != nil {
		return nil, err
	}
	writeDraftTool, err := functiontool.New(functiontool.Config{
		Name:        "write_application_draft",
		Description: "Write copy-ready website field answers with evidence for every answer.",
	}, WriteApplicationDraft)
	if err != nil {
		return nil, err
	}
	markReadyTool, err := functiontool.New(functiontool.Config{
		Name:        "mark_job_brief_ready",
		Description: "Validate the researched fit brief and proposed resume and mark them ready for review.",
	}, MarkReady)
	if err != nil {
		return nil, err
	}

	tools := []tool.Tool{
		saveProfileTool,
		saveWatchlistTool,
		writeInboxTool,
		updateCandidateTool,
		setTargetJobTool,
		writeResearchTool,
		writeMatchTool,
		writeTailoredResumeTool,
		writeDraftTool,
		markReadyTool,
	}
	if search != nil {
		webSearchTool, toolErr := search.SearchTool("Search current public web results for company, role, product, and interview context.")
		if toolErr != nil {
			return nil, toolErr
		}
		tools = append([]tool.Tool{webSearchTool}, tools...)
	}
	if loader != nil {
		readJobPostingTool, toolErr := functiontool.New(functiontool.Config{
			Name:        "read_job_posting",
			Description: "Read the visible text of a public HTTPS job posting before matching it.",
		}, func(ctx agent.Context, input ReadJobPostingArgs) (common.WebPage, error) {
			if input.URL == "" {
				return common.WebPage{}, errors.New("job posting URL is required")
			}
			return loader.Load(ctx, input.URL)
		})
		if toolErr != nil {
			return nil, toolErr
		}
		tools = append([]tool.Tool{readJobPostingTool}, tools...)
	}
	return tools, nil
}
