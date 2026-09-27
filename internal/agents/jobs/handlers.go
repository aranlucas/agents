package jobs

import (
	"cmp"
	"crypto/sha256"
	"fmt"
	"net/mail"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/aranlucas/agents/internal/agentruntime"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

const (
	maxShortValueLength     = 500
	maxLongValueLength      = 10_000
	maxJobDescriptionLength = 100_000
	maxItems                = 30
	maxAnswerLength         = 10_000
)

type Result struct {
	OK     bool                          `json:"ok"`
	Status Status                        `json:"status,omitempty"`
	Error  *agentruntime.StructuredError `json:"error,omitempty"`
}

type SaveApplicationProfileArgs struct {
	Profile ApplicationProfile `json:"profile"`
}

type SaveJobWatchlistArgs struct {
	Watchlist JobWatchlist `json:"watchlist"`
}

type WriteRankedJobInboxArgs struct {
	Candidates []JobCandidate `json:"candidates"`
}

type UpdateJobCandidateArgs struct {
	ID     string          `json:"id"`
	Status CandidateStatus `json:"status"`
}

type SetTargetJobArgs struct {
	TargetTitle    string `json:"target_title"`
	Company        string `json:"company"`
	JobURL         string `json:"job_url"`
	JobDescription string `json:"job_description"`
}

type WriteMatchAssessmentArgs struct {
	MatchScore   int          `json:"match_score"`
	MatchVerdict MatchVerdict `json:"match_verdict"`
	MatchSummary string       `json:"match_summary"`
	Strengths    []string     `json:"strengths"`
	Gaps         []string     `json:"gaps"`
}

type WriteJobResearchArgs struct {
	ResearchSummary string           `json:"research_summary"`
	Sources         []ResearchSource `json:"sources"`
}

type WriteTailoredResumeArgs struct {
	TailoredResume string `json:"tailored_resume"`
}

type WriteApplicationDraftArgs struct {
	Answers []ApplicationAnswer `json:"answers"`
}

type MarkReadyArgs struct {
	ReviewSummary string `json:"review_summary"`
}

func SaveApplicationProfile(ctx agent.Context, input SaveApplicationProfileArgs) (Result, error) {
	state := readState(ctx.State())
	result := saveApplicationProfile(&state, input)
	if !result.OK {
		return result, nil
	}
	if err := ctx.State().Set("profile", state.Profile); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set(session.KeyPrefixUser+"profile", state.Profile); err != nil {
		return Result{}, err
	}
	for key, value := range map[string]any{
		"application_draft": state.ApplicationDraft,
		"tailored_resume":   state.TailoredResume,
		"answers":           state.Answers,
		"status":            state.Status,
		"review_summary":    state.ReviewSummary,
	} {
		if err := ctx.State().Set(key, value); err != nil {
			return Result{}, err
		}
	}
	return result, nil
}

func hydrateJobsUserState(ctx agent.Context) (*genai.Content, error) {
	hydrated := false
	for _, key := range []string{"profile", "watchlist", "inbox", "inbox_refreshed_at"} {
		raw, err := ctx.ReadonlyState().Get(session.KeyPrefixUser + key)
		if err != nil || raw == nil {
			continue
		}
		if err := ctx.State().Set(key, raw); err != nil {
			return nil, err
		}
		hydrated = true
	}
	if hydrated {
		state := readState(ctx.State())
		if state.WorkspaceSummary == "" && (len(state.Inbox) > 0 || len(state.Watchlist.Roles) > 0) {
			if err := ctx.State().Set("workspace_summary", "Ranked job inbox"); err != nil {
				return nil, err
			}
		}
	}
	return nil, nil
}

func saveApplicationProfile(state *JobsState, input SaveApplicationProfileArgs) Result {
	profile, result := cleanProfile(input.Profile)
	if !result.OK {
		return result
	}
	if profileIsEmpty(profile) {
		return fail("empty_profile", "provide at least one application profile fact")
	}
	state.Profile = profile
	state.ApplicationDraft = ""
	state.Answers = []ApplicationAnswer{}
	state.ReviewSummary = ""
	if state.TargetTitle == "" {
		state.Status = StatusIdle
	} else {
		state.Status = StatusDrafting
	}
	return Result{OK: true, Status: state.Status}
}

func SaveJobWatchlist(ctx agent.Context, input SaveJobWatchlistArgs) (Result, error) {
	state := readState(ctx.State())
	result := saveJobWatchlist(&state, input)
	if !result.OK {
		return result, nil
	}
	for key, value := range map[string]any{
		"watchlist":          state.Watchlist,
		"inbox":              state.Inbox,
		"inbox_refreshed_at": state.InboxRefreshedAt,
		"workspace_summary":  state.WorkspaceSummary,
	} {
		if err := ctx.State().Set(key, value); err != nil {
			return Result{}, err
		}
	}
	for key, value := range map[string]any{
		"watchlist":          state.Watchlist,
		"inbox":              state.Inbox,
		"inbox_refreshed_at": state.InboxRefreshedAt,
	} {
		if err := ctx.State().Set(session.KeyPrefixUser+key, value); err != nil {
			return Result{}, err
		}
	}
	return result, nil
}

func saveJobWatchlist(state *JobsState, input SaveJobWatchlistArgs) Result {
	watchlist, result := cleanWatchlist(input.Watchlist)
	if !result.OK {
		return result
	}
	state.Watchlist = watchlist
	state.Inbox = []JobCandidate{}
	state.InboxRefreshedAt = ""
	state.WorkspaceSummary = "Job watchlist"
	return Result{OK: true, Status: state.Status}
}

func WriteRankedJobInbox(ctx agent.Context, input WriteRankedJobInboxArgs) (Result, error) {
	state := readState(ctx.State())
	result := writeRankedJobInbox(&state, input, time.Now().UTC())
	if !result.OK {
		return result, nil
	}
	for key, value := range map[string]any{
		"inbox":              state.Inbox,
		"inbox_refreshed_at": state.InboxRefreshedAt,
		"workspace_summary":  state.WorkspaceSummary,
	} {
		if err := ctx.State().Set(key, value); err != nil {
			return Result{}, err
		}
	}
	for key, value := range map[string]any{
		"inbox":              state.Inbox,
		"inbox_refreshed_at": state.InboxRefreshedAt,
	} {
		if err := ctx.State().Set(session.KeyPrefixUser+key, value); err != nil {
			return Result{}, err
		}
	}
	return result, nil
}

func writeRankedJobInbox(state *JobsState, input WriteRankedJobInboxArgs, refreshedAt time.Time) Result {
	if len(state.Watchlist.Roles) == 0 {
		return fail("job_watchlist_required", "save a job watchlist before writing the ranked inbox")
	}
	candidates, result := cleanCandidates(input.Candidates, state.Inbox)
	if !result.OK {
		return result
	}
	limit := state.Watchlist.MaxResults
	if limit <= 0 || limit > 20 {
		limit = 10
	}
	active := make([]JobCandidate, 0, min(len(candidates), limit))
	for _, candidate := range candidates {
		if candidate.Status != CandidateDismissed && len(active) < limit {
			active = append(active, candidate)
		}
	}
	seen := make(map[string]bool, len(active))
	for _, candidate := range active {
		seen[candidate.URL] = true
	}
	for _, prior := range state.Inbox {
		if seen[prior.URL] || prior.Status == CandidateNew {
			continue
		}
		active = append(active, prior)
		seen[prior.URL] = true
	}
	state.Inbox = active
	state.InboxRefreshedAt = refreshedAt.UTC().Format(time.RFC3339)
	state.WorkspaceSummary = fmt.Sprintf("%d ranked jobs", len(active))
	return Result{OK: true, Status: state.Status}
}

func UpdateJobCandidate(ctx agent.Context, input UpdateJobCandidateArgs) (Result, error) {
	state := readState(ctx.State())
	result := updateJobCandidate(&state, input)
	if !result.OK {
		return result, nil
	}
	if err := ctx.State().Set("inbox", state.Inbox); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set(session.KeyPrefixUser+"inbox", state.Inbox); err != nil {
		return Result{}, err
	}
	return result, nil
}

func updateJobCandidate(state *JobsState, input UpdateJobCandidateArgs) Result {
	id := strings.TrimSpace(input.ID)
	if id == "" || !validCandidateStatus(input.Status) {
		return fail("invalid_candidate_update", "candidate ID and a valid status are required")
	}
	for index := range state.Inbox {
		if state.Inbox[index].ID == id {
			state.Inbox[index].Status = input.Status
			return Result{OK: true, Status: state.Status}
		}
	}
	return fail("candidate_not_found", "job candidate was not found in the inbox")
}

func SetTargetJob(ctx agent.Context, input SetTargetJobArgs) (Result, error) {
	state := readState(ctx.State())
	result := setTargetJob(&state, input)
	if !result.OK {
		return result, nil
	}
	for key, value := range map[string]any{
		"target_title":      state.TargetTitle,
		"workspace_summary": state.WorkspaceSummary,
		"company":           state.Company,
		"job_url":           state.JobURL,
		"job_description":   state.JobDescription,
		"research_summary":  state.ResearchSummary,
		"sources":           state.Sources,
		"match_score":       state.MatchScore,
		"match_verdict":     state.MatchVerdict,
		"match_summary":     state.MatchSummary,
		"strengths":         state.Strengths,
		"gaps":              state.Gaps,
		"application_draft": state.ApplicationDraft,
		"tailored_resume":   state.TailoredResume,
		"answers":           state.Answers,
		"status":            state.Status,
		"review_summary":    state.ReviewSummary,
	} {
		if err := ctx.State().Set(key, value); err != nil {
			return Result{}, err
		}
	}
	return result, nil
}

func setTargetJob(state *JobsState, input SetTargetJobArgs) Result {
	title := strings.TrimSpace(input.TargetTitle)
	company := strings.TrimSpace(input.Company)
	description := strings.TrimSpace(input.JobDescription)
	jobURL := strings.TrimSpace(input.JobURL)
	if title == "" || len(title) > maxShortValueLength {
		return fail("invalid_target_title", "target title is required and must be at most 500 characters")
	}
	if company == "" || len(company) > maxShortValueLength {
		return fail("invalid_company", "company is required and must be at most 500 characters")
	}
	if description == "" {
		return fail("job_description_required", "job description is required for matching")
	}
	if len(description) > maxJobDescriptionLength {
		return fail("job_description_too_large", "job description exceeds the 100,000 character limit")
	}
	if jobURL != "" && !validHTTPSURL(jobURL) {
		return fail("invalid_job_url", "job URL must be a public HTTPS URL")
	}

	state.TargetTitle = title
	state.WorkspaceSummary = title + " at " + company
	state.Company = company
	state.JobURL = jobURL
	state.JobDescription = description
	state.ResearchSummary = ""
	state.Sources = []ResearchSource{}
	state.MatchScore = 0
	state.MatchVerdict = ""
	state.MatchSummary = ""
	state.Strengths = []string{}
	state.Gaps = []string{}
	state.TailoredResume = ""
	state.ApplicationDraft = ""
	state.Answers = []ApplicationAnswer{}
	state.Status = StatusResearching
	state.ReviewSummary = ""
	return Result{OK: true, Status: state.Status}
}

func WriteJobResearch(ctx agent.Context, input WriteJobResearchArgs) (Result, error) {
	state := readState(ctx.State())
	result := writeJobResearch(&state, input)
	if !result.OK {
		return result, nil
	}
	for key, value := range map[string]any{
		"research_summary": state.ResearchSummary,
		"sources":          state.Sources,
		"status":           state.Status,
		"review_summary":   state.ReviewSummary,
	} {
		if err := ctx.State().Set(key, value); err != nil {
			return Result{}, err
		}
	}
	return result, nil
}

func writeJobResearch(state *JobsState, input WriteJobResearchArgs) Result {
	if state.TargetTitle == "" || state.Company == "" || state.JobDescription == "" {
		return fail("target_job_required", "set a target job before writing research")
	}
	summary := strings.TrimSpace(input.ResearchSummary)
	if summary == "" || len(summary) > maxLongValueLength {
		return fail("invalid_research_summary", "research summary is required and must be at most 10,000 characters")
	}
	sources, result := cleanSources(input.Sources)
	if !result.OK {
		return result
	}
	state.ResearchSummary = summary
	state.Sources = sources
	state.Status = StatusMatching
	state.ReviewSummary = ""
	return Result{OK: true, Status: state.Status}
}

func WriteMatchAssessment(ctx agent.Context, input WriteMatchAssessmentArgs) (Result, error) {
	state := readState(ctx.State())
	result := writeMatchAssessment(&state, input)
	if !result.OK {
		return result, nil
	}
	for key, value := range map[string]any{
		"match_score":       state.MatchScore,
		"match_verdict":     state.MatchVerdict,
		"match_summary":     state.MatchSummary,
		"strengths":         state.Strengths,
		"gaps":              state.Gaps,
		"tailored_resume":   state.TailoredResume,
		"application_draft": state.ApplicationDraft,
		"answers":           state.Answers,
		"status":            state.Status,
		"review_summary":    state.ReviewSummary,
	} {
		if err := ctx.State().Set(key, value); err != nil {
			return Result{}, err
		}
	}
	return result, nil
}

func writeMatchAssessment(state *JobsState, input WriteMatchAssessmentArgs) Result {
	if state.TargetTitle == "" || state.Company == "" || state.JobDescription == "" {
		return fail("target_job_required", "set a target job before writing a match assessment")
	}
	if state.ResearchSummary == "" {
		return fail("job_research_required", "write the job and company research summary before assessing fit")
	}
	if input.MatchScore < 0 || input.MatchScore > 100 {
		return fail("invalid_match_score", "match score must be between 0 and 100")
	}
	if !validVerdict(input.MatchVerdict) {
		return fail("invalid_match_verdict", "match verdict must be strong_match, match, stretch, or skip")
	}
	summary := strings.TrimSpace(input.MatchSummary)
	if summary == "" || len(summary) > maxLongValueLength {
		return fail("invalid_match_summary", "match summary is required and must be at most 10,000 characters")
	}
	strengths, result := cleanItems(input.Strengths, true, "strengths")
	if !result.OK {
		return result
	}
	gaps, result := cleanItems(input.Gaps, false, "gaps")
	if !result.OK {
		return result
	}
	state.MatchScore = input.MatchScore
	state.MatchVerdict = input.MatchVerdict
	state.MatchSummary = summary
	state.Strengths = strengths
	state.Gaps = gaps
	state.TailoredResume = ""
	state.ApplicationDraft = ""
	state.Answers = []ApplicationAnswer{}
	state.Status = StatusDrafting
	state.ReviewSummary = ""
	return Result{OK: true, Status: state.Status}
}

func WriteTailoredResume(ctx agent.Context, input WriteTailoredResumeArgs) (Result, error) {
	state := readState(ctx.State())
	result := writeTailoredResume(&state, input)
	if !result.OK {
		return result, nil
	}
	for key, value := range map[string]any{
		"tailored_resume":   state.TailoredResume,
		"application_draft": state.ApplicationDraft,
		"answers":           state.Answers,
		"status":            state.Status,
		"review_summary":    state.ReviewSummary,
	} {
		if err := ctx.State().Set(key, value); err != nil {
			return Result{}, err
		}
	}
	return result, nil
}

func writeTailoredResume(state *JobsState, input WriteTailoredResumeArgs) Result {
	if state.MatchSummary == "" || !validVerdict(state.MatchVerdict) {
		return fail("match_assessment_required", "write a match assessment before tailoring the resume")
	}
	resume := strings.TrimSpace(input.TailoredResume)
	if resume == "" || len(resume) > maxJobDescriptionLength {
		return fail("invalid_tailored_resume", "tailored resume is required and must be at most 100,000 characters")
	}
	state.TailoredResume = resume
	state.ApplicationDraft = ""
	state.Answers = []ApplicationAnswer{}
	state.Status = StatusDrafting
	state.ReviewSummary = ""
	return Result{OK: true, Status: state.Status}
}

func WriteApplicationDraft(ctx agent.Context, input WriteApplicationDraftArgs) (Result, error) {
	state := readState(ctx.State())
	result := writeApplicationDraft(&state, input)
	if !result.OK {
		return result, nil
	}
	for key, value := range map[string]any{
		"application_draft": state.ApplicationDraft,
		"answers":           state.Answers,
		"status":            state.Status,
		"review_summary":    state.ReviewSummary,
	} {
		if err := ctx.State().Set(key, value); err != nil {
			return Result{}, err
		}
	}
	return result, nil
}

func writeApplicationDraft(state *JobsState, input WriteApplicationDraftArgs) Result {
	if state.MatchSummary == "" || !validVerdict(state.MatchVerdict) {
		return fail("match_assessment_required", "write a match assessment before drafting application answers")
	}
	if state.TailoredResume == "" {
		return fail("tailored_resume_required", "write the proposed tailored resume before drafting application answers")
	}
	answers, result := cleanAnswers(input.Answers)
	if !result.OK {
		return result
	}
	state.Answers = answers
	state.ApplicationDraft = renderApplicationDraft(*state)
	state.Status = StatusDrafting
	state.ReviewSummary = ""
	return Result{OK: true, Status: state.Status}
}

func MarkReady(ctx agent.Context, input MarkReadyArgs) (Result, error) {
	state := readState(ctx.State())
	result := markReady(&state, input)
	if !result.OK {
		return result, nil
	}
	if err := ctx.State().Set("status", state.Status); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("review_summary", state.ReviewSummary); err != nil {
		return Result{}, err
	}
	state.ApplicationDraft = renderApplicationDraft(state)
	if err := ctx.State().Set("application_draft", state.ApplicationDraft); err != nil {
		return Result{}, err
	}
	return result, nil
}

func markReady(state *JobsState, input MarkReadyArgs) Result {
	if state.MatchSummary == "" || !validVerdict(state.MatchVerdict) {
		return fail("match_assessment_required", "a match assessment is required before marking ready")
	}
	if state.TailoredResume == "" {
		return fail("tailored_resume_required", "a proposed tailored resume is required before marking ready")
	}
	summary := strings.TrimSpace(input.ReviewSummary)
	if summary == "" || len(summary) > maxLongValueLength {
		return fail("invalid_review_summary", "review summary is required and must be at most 10,000 characters")
	}
	state.Status = StatusReady
	state.ReviewSummary = summary
	return Result{OK: true, Status: state.Status}
}

func cleanProfile(profile ApplicationProfile) (ApplicationProfile, Result) {
	values := []*string{
		&profile.FullName, &profile.Email, &profile.Phone, &profile.Location,
		&profile.LinkedInURL, &profile.GitHubURL, &profile.PortfolioURL,
		&profile.WorkAuthorization, &profile.Sponsorship, &profile.RemotePreference,
		&profile.Relocation, &profile.SalaryExpectation, &profile.VoiceNotes,
	}
	for _, value := range values {
		*value = strings.TrimSpace(*value)
		if len(*value) > maxLongValueLength {
			return ApplicationProfile{}, fail("profile_value_too_large", "profile values must be at most 10,000 characters")
		}
	}
	if profile.Email != "" {
		address, err := mail.ParseAddress(profile.Email)
		if err != nil || address.Address != profile.Email {
			return ApplicationProfile{}, fail("invalid_email", "profile email must be a valid address")
		}
	}
	for name, raw := range map[string]string{
		"linkedin_url":  profile.LinkedInURL,
		"github_url":    profile.GitHubURL,
		"portfolio_url": profile.PortfolioURL,
	} {
		if raw != "" && !validHTTPSURL(raw) {
			return ApplicationProfile{}, fail("invalid_"+name, name+" must be an HTTPS URL")
		}
	}
	facts, result := cleanItems(profile.AdditionalFacts, false, "additional_facts")
	if !result.OK {
		return ApplicationProfile{}, result
	}
	profile.AdditionalFacts = facts
	return profile, Result{OK: true}
}

func profileIsEmpty(profile ApplicationProfile) bool {
	return profile.FullName == "" && profile.Email == "" && profile.Phone == "" &&
		profile.Location == "" && profile.LinkedInURL == "" && profile.GitHubURL == "" &&
		profile.PortfolioURL == "" && profile.WorkAuthorization == "" &&
		profile.Sponsorship == "" && profile.RemotePreference == "" &&
		profile.Relocation == "" && profile.SalaryExpectation == "" &&
		profile.VoiceNotes == "" && len(profile.AdditionalFacts) == 0
}

func cleanItems(items []string, required bool, field string) ([]string, Result) {
	if len(items) > maxItems {
		return nil, fail("too_many_"+field, field+" cannot contain more than 30 items")
	}
	cleaned := make([]string, 0, len(items))
	seen := make(map[string]bool, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item == "" || len(item) > maxLongValueLength {
			return nil, fail("invalid_"+field, field+" must contain only non-empty items within the allowed length")
		}
		if !seen[item] {
			seen[item] = true
			cleaned = append(cleaned, item)
		}
	}
	if required && len(cleaned) == 0 {
		return nil, fail(field+"_required", "at least one "+field+" item is required")
	}
	return cleaned, Result{OK: true}
}

func cleanAnswers(answers []ApplicationAnswer) ([]ApplicationAnswer, Result) {
	if len(answers) == 0 {
		return nil, fail("application_answers_required", "at least one application answer is required")
	}
	if len(answers) > maxItems {
		return nil, fail("too_many_application_answers", "application answers cannot contain more than 30 items")
	}
	cleaned := make([]ApplicationAnswer, 0, len(answers))
	seen := make(map[string]bool, len(answers))
	for _, answer := range answers {
		answer.Field = strings.TrimSpace(answer.Field)
		answer.Answer = strings.TrimSpace(answer.Answer)
		answer.Evidence = strings.TrimSpace(answer.Evidence)
		if answer.Field == "" || len(answer.Field) > maxShortValueLength ||
			answer.Answer == "" || len(answer.Answer) > maxAnswerLength ||
			answer.Evidence == "" || len(answer.Evidence) > maxLongValueLength {
			return nil, fail("invalid_application_answer", "each answer requires a field, answer, and evidence within the allowed lengths")
		}
		key := strings.ToLower(answer.Field)
		if seen[key] {
			return nil, fail("duplicate_application_field", "application answer fields must be unique")
		}
		seen[key] = true
		cleaned = append(cleaned, answer)
	}
	return cleaned, Result{OK: true}
}

func cleanWatchlist(watchlist JobWatchlist) (JobWatchlist, Result) {
	var result Result
	watchlist.Roles, result = cleanItems(watchlist.Roles, true, "roles")
	if !result.OK {
		return JobWatchlist{}, result
	}
	watchlist.Locations, result = cleanItems(watchlist.Locations, false, "locations")
	if !result.OK {
		return JobWatchlist{}, result
	}
	watchlist.CompanyPreferences, result = cleanItems(watchlist.CompanyPreferences, false, "company_preferences")
	if !result.OK {
		return JobWatchlist{}, result
	}
	watchlist.MustHave, result = cleanItems(watchlist.MustHave, false, "must_have")
	if !result.OK {
		return JobWatchlist{}, result
	}
	watchlist.Exclude, result = cleanItems(watchlist.Exclude, false, "exclude")
	if !result.OK {
		return JobWatchlist{}, result
	}
	if watchlist.MinimumSalaryUSD < 0 || watchlist.MinimumSalaryUSD > 10_000_000 {
		return JobWatchlist{}, fail("invalid_minimum_salary", "minimum salary must be between 0 and 10,000,000 USD")
	}
	if watchlist.MaxResults == 0 {
		watchlist.MaxResults = 10
	}
	if watchlist.MaxResults < 1 || watchlist.MaxResults > 20 {
		return JobWatchlist{}, fail("invalid_max_results", "max results must be between 1 and 20")
	}
	return watchlist, Result{OK: true}
}

func cleanCandidates(candidates, existing []JobCandidate) ([]JobCandidate, Result) {
	if len(candidates) > maxItems {
		return nil, fail("too_many_job_candidates", "ranked job inbox cannot contain more than 30 candidates")
	}
	existingStatus := make(map[string]CandidateStatus, len(existing))
	for _, candidate := range existing {
		if candidate.URL != "" && validCandidateStatus(candidate.Status) {
			existingStatus[candidate.URL] = candidate.Status
		}
	}
	cleaned := make([]JobCandidate, 0, len(candidates))
	seen := make(map[string]bool, len(candidates))
	for _, candidate := range candidates {
		candidate.Title = strings.TrimSpace(candidate.Title)
		candidate.Company = strings.TrimSpace(candidate.Company)
		candidate.Location = strings.TrimSpace(candidate.Location)
		candidate.URL = strings.TrimSpace(candidate.URL)
		candidate.PostedAt = strings.TrimSpace(candidate.PostedAt)
		candidate.Compensation = strings.TrimSpace(candidate.Compensation)
		candidate.Summary = strings.TrimSpace(candidate.Summary)
		if candidate.Title == "" || len(candidate.Title) > maxShortValueLength ||
			candidate.Company == "" || len(candidate.Company) > maxShortValueLength ||
			candidate.Location == "" || len(candidate.Location) > maxShortValueLength ||
			!validHTTPSURL(candidate.URL) ||
			candidate.Summary == "" || len(candidate.Summary) > maxLongValueLength ||
			candidate.MatchScore < 0 || candidate.MatchScore > 100 ||
			!validVerdict(candidate.MatchVerdict) {
			return nil, fail("invalid_job_candidate", "each candidate requires valid job details, HTTPS URL, summary, score, and verdict")
		}
		if len(candidate.PostedAt) > maxShortValueLength || len(candidate.Compensation) > maxShortValueLength {
			return nil, fail("invalid_job_candidate", "candidate date and compensation must be at most 500 characters")
		}
		whyMatch, result := cleanItems(candidate.WhyMatch, true, "why_match")
		if !result.OK {
			return nil, result
		}
		concerns, result := cleanItems(candidate.Concerns, false, "concerns")
		if !result.OK {
			return nil, result
		}
		sources, result := cleanSources(candidate.Sources)
		if !result.OK {
			return nil, result
		}
		if len(sources) == 0 {
			return nil, fail("job_candidate_source_required", "each candidate requires at least one public research source")
		}
		if seen[candidate.URL] {
			continue
		}
		seen[candidate.URL] = true
		candidate.ID = candidateID(candidate.URL)
		candidate.WhyMatch = whyMatch
		candidate.Concerns = concerns
		candidate.Sources = sources
		candidate.Status = existingStatus[candidate.URL]
		if candidate.Status == "" {
			candidate.Status = CandidateNew
		}
		cleaned = append(cleaned, candidate)
	}
	slices.SortStableFunc(cleaned, func(a, b JobCandidate) int {
		if a.MatchScore == b.MatchScore {
			return cmp.Compare(a.Company, b.Company)
		}
		return cmp.Compare(b.MatchScore, a.MatchScore)
	})
	return cleaned, Result{OK: true}
}

func cleanSources(sources []ResearchSource) ([]ResearchSource, Result) {
	if len(sources) > maxItems {
		return nil, fail("too_many_research_sources", "research sources cannot contain more than 30 items")
	}
	cleaned := make([]ResearchSource, 0, len(sources))
	seen := make(map[string]bool, len(sources))
	for _, source := range sources {
		source.Title = strings.TrimSpace(source.Title)
		source.URL = strings.TrimSpace(source.URL)
		source.Summary = strings.TrimSpace(source.Summary)
		if source.Title == "" || len(source.Title) > maxShortValueLength ||
			!validHTTPSURL(source.URL) || source.Summary == "" || len(source.Summary) > maxLongValueLength {
			return nil, fail("invalid_research_source", "each research source requires a title, HTTPS URL, and bounded summary")
		}
		if seen[source.URL] {
			continue
		}
		seen[source.URL] = true
		cleaned = append(cleaned, source)
	}
	return cleaned, Result{OK: true}
}

func validVerdict(verdict MatchVerdict) bool {
	switch verdict {
	case VerdictStrongMatch, VerdictMatch, VerdictStretch, VerdictSkip:
		return true
	default:
		return false
	}
}

func validCandidateStatus(status CandidateStatus) bool {
	switch status {
	case CandidateNew, CandidateShortlisted, CandidateDismissed:
		return true
	default:
		return false
	}
}

func candidateID(rawURL string) string {
	sum := sha256.Sum256([]byte(rawURL))
	return fmt.Sprintf("job_%x", sum[:8])
}

func validHTTPSURL(raw string) bool {
	parsed, err := url.Parse(raw)
	return err == nil && parsed.Scheme == "https" && parsed.Host != "" && parsed.User == nil
}

func renderApplicationDraft(state JobsState) string {
	var out strings.Builder
	fmt.Fprintf(&out, "# %s at %s\n\n", state.TargetTitle, state.Company)
	fmt.Fprintf(&out, "## Match: %d/100 — %s\n\n%s\n", state.MatchScore, strings.ReplaceAll(string(state.MatchVerdict), "_", " "), state.MatchSummary)
	if state.ResearchSummary != "" {
		fmt.Fprintf(&out, "\n## Research brief\n\n%s\n", state.ResearchSummary)
	}
	if len(state.Strengths) > 0 {
		out.WriteString("\n## Documented strengths\n\n")
		for _, strength := range state.Strengths {
			fmt.Fprintf(&out, "- %s\n", strength)
		}
	}
	if len(state.Gaps) > 0 {
		out.WriteString("\n## Evidence gaps\n\n")
		for _, gap := range state.Gaps {
			fmt.Fprintf(&out, "- %s\n", gap)
		}
	}
	if state.TailoredResume != "" {
		fmt.Fprintf(&out, "\n## Proposed tailored resume\n\n%s\n", state.TailoredResume)
	}
	if len(state.Answers) > 0 {
		out.WriteString("\n## Application answers\n")
		for _, answer := range state.Answers {
			fmt.Fprintf(&out, "\n### %s\n\n%s\n\n_Evidence: %s_\n", answer.Field, answer.Answer, answer.Evidence)
		}
	}
	if state.ReviewSummary != "" {
		fmt.Fprintf(&out, "\n## Review\n\n%s\n", state.ReviewSummary)
	}
	return strings.TrimSpace(out.String())
}

func fail(code, message string) Result {
	return Result{Error: &agentruntime.StructuredError{Code: code, Message: message}}
}
