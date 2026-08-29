package jobs

import (
	json "encoding/json/v2"
	"maps"

	"google.golang.org/adk/v2/session"
)

const AppName = "jobs_agent"

type Status string

const (
	StatusIdle        Status = "idle"
	StatusResearching Status = "researching"
	StatusMatching    Status = "matching"
	StatusDrafting    Status = "drafting"
	StatusReady       Status = "ready"
)

type MatchVerdict string

const (
	VerdictStrongMatch MatchVerdict = "strong_match"
	VerdictMatch       MatchVerdict = "match"
	VerdictStretch     MatchVerdict = "stretch"
	VerdictSkip        MatchVerdict = "skip"
)

type CandidateStatus string

const (
	CandidateNew         CandidateStatus = "new"
	CandidateShortlisted CandidateStatus = "shortlisted"
	CandidateDismissed   CandidateStatus = "dismissed"
)

// ApplicationProfile contains only facts the user has explicitly provided.
// Empty values are intentional: the agent must ask rather than infer.
type ApplicationProfile struct {
	FullName          string   `json:"full_name"`
	Email             string   `json:"email"`
	Phone             string   `json:"phone"`
	Location          string   `json:"location"`
	LinkedInURL       string   `json:"linkedin_url"`
	GitHubURL         string   `json:"github_url"`
	PortfolioURL      string   `json:"portfolio_url"`
	WorkAuthorization string   `json:"work_authorization"`
	Sponsorship       string   `json:"sponsorship"`
	RemotePreference  string   `json:"remote_preference"`
	Relocation        string   `json:"relocation"`
	SalaryExpectation string   `json:"salary_expectation"`
	VoiceNotes        string   `json:"voice_notes"`
	AdditionalFacts   []string `json:"additional_facts"`
}

// ApplicationAnswer is one copy-ready response for a field on an external
// application site. Evidence keeps every answer auditable.
type ApplicationAnswer struct {
	Field     string `json:"field"`
	Answer    string `json:"answer"`
	Evidence  string `json:"evidence"`
	Sensitive bool   `json:"sensitive"`
}

type ResearchSource struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Summary string `json:"summary"`
}

type JobWatchlist struct {
	Roles              []string `json:"roles"`
	Locations          []string `json:"locations"`
	RemoteOnly         bool     `json:"remote_only"`
	CompanyPreferences []string `json:"company_preferences"`
	MustHave           []string `json:"must_have"`
	Exclude            []string `json:"exclude"`
	MinimumSalaryUSD   int      `json:"minimum_salary_usd"`
	MaxResults         int      `json:"max_results"`
}

type JobCandidate struct {
	ID           string           `json:"id"`
	Title        string           `json:"title"`
	Company      string           `json:"company"`
	Location     string           `json:"location"`
	URL          string           `json:"url"`
	PostedAt     string           `json:"posted_at"`
	Compensation string           `json:"compensation"`
	Summary      string           `json:"summary"`
	MatchScore   int              `json:"match_score"`
	MatchVerdict MatchVerdict     `json:"match_verdict"`
	WhyMatch     []string         `json:"why_match"`
	Concerns     []string         `json:"concerns"`
	Sources      []ResearchSource `json:"sources"`
	Status       CandidateStatus  `json:"status"`
}

type JobsState struct {
	Profile          ApplicationProfile  `json:"profile"`
	Watchlist        JobWatchlist        `json:"watchlist"`
	Inbox            []JobCandidate      `json:"inbox"`
	InboxRefreshedAt string              `json:"inbox_refreshed_at"`
	WorkspaceSummary string              `json:"workspace_summary"`
	TargetTitle      string              `json:"target_title"`
	Company          string              `json:"company"`
	JobURL           string              `json:"job_url"`
	JobDescription   string              `json:"job_description"`
	ResearchSummary  string              `json:"research_summary"`
	Sources          []ResearchSource    `json:"sources"`
	MatchScore       int                 `json:"match_score"`
	MatchVerdict     MatchVerdict        `json:"match_verdict"`
	MatchSummary     string              `json:"match_summary"`
	Strengths        []string            `json:"strengths"`
	Gaps             []string            `json:"gaps"`
	TailoredResume   string              `json:"tailored_resume"`
	ApplicationDraft string              `json:"application_draft"`
	Answers          []ApplicationAnswer `json:"answers"`
	Status           Status              `json:"status"`
	ReviewSummary    string              `json:"review_summary"`
}

func Defaults() JobsState {
	return JobsState{
		Profile: ApplicationProfile{
			AdditionalFacts: []string{},
		},
		Watchlist: JobWatchlist{
			Roles:              []string{},
			Locations:          []string{},
			CompanyPreferences: []string{},
			MustHave:           []string{},
			Exclude:            []string{},
			MaxResults:         10,
		},
		Inbox:     []JobCandidate{},
		Strengths: []string{},
		Gaps:      []string{},
		Sources:   []ResearchSource{},
		Answers:   []ApplicationAnswer{},
		Status:    StatusIdle,
	}
}

func StateDefaults() map[string]any {
	encoded, _ := json.Marshal(Defaults())
	var values map[string]any
	_ = json.Unmarshal(encoded, &values)
	return values
}

func readState(source session.ReadonlyState) JobsState {
	state := Defaults()
	values := make(map[string]any)
	if source != nil {
		maps.Insert(values, source.All())
	}
	for _, key := range []string{"profile", "watchlist", "inbox", "inbox_refreshed_at"} {
		if value, ok := values[session.KeyPrefixUser+key]; ok {
			values[key] = value
		}
	}
	encoded, err := json.Marshal(values)
	if err == nil {
		_ = json.Unmarshal(encoded, &state)
	}
	if state.Profile.AdditionalFacts == nil {
		state.Profile.AdditionalFacts = []string{}
	}
	if state.Watchlist.Roles == nil {
		state.Watchlist.Roles = []string{}
	}
	if state.Watchlist.Locations == nil {
		state.Watchlist.Locations = []string{}
	}
	if state.Watchlist.CompanyPreferences == nil {
		state.Watchlist.CompanyPreferences = []string{}
	}
	if state.Watchlist.MustHave == nil {
		state.Watchlist.MustHave = []string{}
	}
	if state.Watchlist.Exclude == nil {
		state.Watchlist.Exclude = []string{}
	}
	if state.Watchlist.MaxResults <= 0 {
		state.Watchlist.MaxResults = 10
	}
	if state.Inbox == nil {
		state.Inbox = []JobCandidate{}
	}
	for index := range state.Inbox {
		if state.Inbox[index].WhyMatch == nil {
			state.Inbox[index].WhyMatch = []string{}
		}
		if state.Inbox[index].Concerns == nil {
			state.Inbox[index].Concerns = []string{}
		}
		if state.Inbox[index].Sources == nil {
			state.Inbox[index].Sources = []ResearchSource{}
		}
		if state.Inbox[index].Status == "" {
			state.Inbox[index].Status = CandidateNew
		}
	}
	if state.Strengths == nil {
		state.Strengths = []string{}
	}
	if state.Gaps == nil {
		state.Gaps = []string{}
	}
	if state.Sources == nil {
		state.Sources = []ResearchSource{}
	}
	if state.Answers == nil {
		state.Answers = []ApplicationAnswer{}
	}
	if state.Status == "" {
		state.Status = StatusIdle
	}
	return state
}
