package jobs

import (
	"encoding/json"
	"errors"
	"iter"
	"strings"
	"testing"
	"time"
)

type readonlyState map[string]any

func (state readonlyState) Get(key string) (any, error) {
	value, ok := state[key]
	if !ok {
		return nil, errors.New("missing state key")
	}
	return value, nil
}

func (state readonlyState) All() iter.Seq2[string, any] {
	return func(yield func(string, any) bool) {
		for key, value := range state {
			if !yield(key, value) {
				return
			}
		}
	}
}

func TestStateDefaultsUseStableCollections(t *testing.T) {
	state := Defaults()
	if state.Status != StatusIdle || state.Strengths == nil || state.Gaps == nil ||
		state.Answers == nil || state.Profile.AdditionalFacts == nil {
		t.Fatalf("Defaults() = %#v", state)
	}
	if got := len(StateDefaults()); got != 21 {
		t.Fatalf("StateDefaults() has %d keys", got)
	}
}

func TestReadStateHydratesUserScopedApplicationProfile(t *testing.T) {
	state := readState(readonlyState{
		"profile":      ApplicationProfile{},
		"user:profile": ApplicationProfile{FullName: "Lucas Arango", VoiceNotes: "Direct and concrete."},
	})
	if state.Profile.FullName != "Lucas Arango" || state.Profile.VoiceNotes != "Direct and concrete." {
		t.Fatalf("user-scoped profile was not hydrated: %#v", state.Profile)
	}
}

func TestWatchlistIsValidatedAndResetsStaleInbox(t *testing.T) {
	state := Defaults()
	state.Inbox = []JobCandidate{{ID: "old", URL: "https://example.com/old"}}
	state.InboxRefreshedAt = "2026-07-26T12:00:00Z"
	result := saveJobWatchlist(&state, SaveJobWatchlistArgs{Watchlist: JobWatchlist{
		Roles:            []string{" Staff Software Engineer ", "Staff Software Engineer"},
		Locations:        []string{"Seattle", "Remote"},
		RemoteOnly:       true,
		MustHave:         []string{"Application-layer AI"},
		Exclude:          []string{"Engineering management"},
		MinimumSalaryUSD: 250_000,
		MaxResults:       5,
	}})
	if !result.OK || len(state.Watchlist.Roles) != 1 || len(state.Inbox) != 0 ||
		state.InboxRefreshedAt != "" || state.WorkspaceSummary != "Job watchlist" {
		t.Fatalf("saveJobWatchlist() = %#v; state = %#v", result, state)
	}
}

func TestRankedInboxDeduplicatesAndPreservesDecisions(t *testing.T) {
	state := Defaults()
	state.Watchlist = JobWatchlist{Roles: []string{"Staff Software Engineer"}, MaxResults: 2}
	state.Inbox = []JobCandidate{
		{
			ID: "prior-shortlist", Title: "Staff Engineer", Company: "Keep",
			Location: "Remote", URL: "https://keep.example/jobs/1",
			Summary: "Prior shortlist.", MatchScore: 80, MatchVerdict: VerdictMatch,
			WhyMatch: []string{"Prior evidence."}, Sources: []ResearchSource{},
			Status: CandidateShortlisted,
		},
		{
			ID: "prior-dismissed", Title: "Manager", Company: "Skip",
			Location: "Seattle", URL: "https://skip.example/jobs/2",
			Summary: "Prior dismissal.", MatchScore: 40, MatchVerdict: VerdictSkip,
			WhyMatch: []string{"Some overlap."}, Sources: []ResearchSource{},
			Status: CandidateDismissed,
		},
	}
	result := writeRankedJobInbox(&state, WriteRankedJobInboxArgs{Candidates: []JobCandidate{
		{
			Title: "Senior Engineer", Company: "New", Location: "Remote",
			URL: "https://new.example/jobs/3", Summary: "New role.",
			MatchScore: 91, MatchVerdict: VerdictStrongMatch,
			WhyMatch: []string{"Direct AI product evidence."},
			Sources: []ResearchSource{{
				Title: "New careers", URL: "https://new.example/jobs/3", Summary: "Original posting.",
			}},
		},
		{
			Title: "Staff Engineer", Company: "Keep", Location: "Remote",
			URL: "https://keep.example/jobs/1", Summary: "Refreshed role.",
			MatchScore: 84, MatchVerdict: VerdictMatch,
			WhyMatch: []string{"Product leadership evidence."},
			Sources: []ResearchSource{{
				Title: "Keep careers", URL: "https://keep.example/jobs/1", Summary: "Original posting.",
			}},
		},
		{
			Title: "Duplicate", Company: "New", Location: "Remote",
			URL: "https://new.example/jobs/3", Summary: "Duplicate result.",
			MatchScore: 70, MatchVerdict: VerdictMatch,
			WhyMatch: []string{"Duplicate."},
			Sources: []ResearchSource{{
				Title: "New careers", URL: "https://new.example/jobs/3", Summary: "Original posting.",
			}},
		},
	}}, time.Date(2026, 7, 26, 12, 30, 0, 0, time.UTC))
	if !result.OK || len(state.Inbox) != 3 {
		t.Fatalf("writeRankedJobInbox() = %#v; inbox = %#v", result, state.Inbox)
	}
	if state.Inbox[0].Company != "New" || state.Inbox[1].Status != CandidateShortlisted ||
		state.Inbox[2].Status != CandidateDismissed {
		t.Fatalf("ranked decisions were not preserved: %#v", state.Inbox)
	}
	if state.Inbox[0].ID == "" || state.InboxRefreshedAt != "2026-07-26T12:30:00Z" {
		t.Fatalf("derived inbox metadata = %#v, %q", state.Inbox[0], state.InboxRefreshedAt)
	}
}

func TestCandidateStatusUpdateRequiresExistingCandidate(t *testing.T) {
	state := Defaults()
	state.Inbox = []JobCandidate{{ID: "job_1", Status: CandidateNew}}
	result := updateJobCandidate(&state, UpdateJobCandidateArgs{
		ID: "job_1", Status: CandidateShortlisted,
	})
	if !result.OK || state.Inbox[0].Status != CandidateShortlisted {
		t.Fatalf("updateJobCandidate() = %#v; inbox = %#v", result, state.Inbox)
	}
	result = updateJobCandidate(&state, UpdateJobCandidateArgs{
		ID: "missing", Status: CandidateDismissed,
	})
	if result.OK || result.Error == nil || result.Error.Code != "candidate_not_found" {
		t.Fatalf("missing candidate result = %#v", result)
	}
}

func TestProfileRejectsInventedEmptyOrInvalidContactData(t *testing.T) {
	state := Defaults()
	before, _ := json.Marshal(state)
	result := saveApplicationProfile(&state, SaveApplicationProfileArgs{})
	if result.OK || result.Error == nil || result.Error.Code != "empty_profile" {
		t.Fatalf("empty profile result = %#v", result)
	}
	result = saveApplicationProfile(&state, SaveApplicationProfileArgs{
		Profile: ApplicationProfile{Email: "not-an-email"},
	})
	if result.OK || result.Error == nil || result.Error.Code != "invalid_email" {
		t.Fatalf("invalid email result = %#v", result)
	}
	after, _ := json.Marshal(state)
	if string(before) != string(after) {
		t.Fatalf("invalid profile mutated state: %#v", state)
	}
}

func TestTargetJobResetsStaleApplication(t *testing.T) {
	state := JobsState{
		TargetTitle: "Old", Company: "Old Co", MatchScore: 90,
		MatchVerdict: VerdictStrongMatch, MatchSummary: "Old",
		Strengths: []string{"Old"}, Gaps: []string{"Old"},
		Answers:          []ApplicationAnswer{{Field: "Why", Answer: "Old", Evidence: "Old"}},
		ApplicationDraft: "Old", Status: StatusReady, ReviewSummary: "Old",
	}
	result := setTargetJob(&state, SetTargetJobArgs{
		TargetTitle:    "Staff Software Engineer",
		Company:        "Example",
		JobURL:         "https://example.com/jobs/1",
		JobDescription: "Lead AI product delivery.",
	})
	if !result.OK || state.Status != StatusResearching || state.MatchSummary != "" ||
		len(state.Answers) != 0 || state.ApplicationDraft != "" {
		t.Fatalf("setTargetJob() = %#v; state = %#v", result, state)
	}
}

func TestMatchAndApplicationWorkflowReachesReady(t *testing.T) {
	state := Defaults()
	if result := setTargetJob(&state, SetTargetJobArgs{
		TargetTitle:    "Staff AI Engineer",
		Company:        "Example",
		JobDescription: "Lead cross-functional AI product launches.",
	}); !result.OK {
		t.Fatal(result)
	}
	if result := writeJobResearch(&state, WriteJobResearchArgs{
		ResearchSummary: "The company is investing in application-layer AI.",
		Sources: []ResearchSource{{
			Title: "Example careers", URL: "https://example.com/careers",
			Summary: "Describes the role and product area.",
		}},
	}); !result.OK {
		t.Fatal(result)
	}
	result := writeMatchAssessment(&state, WriteMatchAssessmentArgs{
		MatchScore: 88, MatchVerdict: VerdictStrongMatch,
		MatchSummary: "Direct evidence of zero-to-one AI product leadership.",
		Strengths:    []string{"Pitched and led Ask DoorDash.", "Pitched and led Ask DoorDash."},
		Gaps:         []string{"No model-training ownership documented."},
	})
	if !result.OK || state.Status != StatusDrafting || len(state.Strengths) != 1 {
		t.Fatalf("writeMatchAssessment() = %#v; state = %#v", result, state)
	}
	result = writeTailoredResume(&state, WriteTailoredResumeArgs{
		TailoredResume: "# Lucas Arango\n\n## Experience\n\n- Pitched and led Ask DoorDash.",
	})
	if !result.OK {
		t.Fatal(result)
	}
	result = writeApplicationDraft(&state, WriteApplicationDraftArgs{Answers: []ApplicationAnswer{
		{
			Field:    "Why are you interested?",
			Answer:   "I like taking AI products from a useful prototype to a reliable launch.",
			Evidence: "Ask DoorDash was pitched, prototyped, and led through launch.",
		},
	}})
	if !result.OK || !strings.Contains(state.ApplicationDraft, "Why are you interested?") {
		t.Fatalf("writeApplicationDraft() = %#v; draft = %q", result, state.ApplicationDraft)
	}
	result = markReady(&state, MarkReadyArgs{ReviewSummary: "Review sensitive fields and submit manually."})
	if !result.OK || state.Status != StatusReady {
		t.Fatalf("markReady() = %#v; state = %#v", result, state)
	}
}

func TestApplicationAnswersRequireUniqueAuditableFields(t *testing.T) {
	state := Defaults()
	_ = setTargetJob(&state, SetTargetJobArgs{
		TargetTitle: "Engineer", Company: "Example", JobDescription: "Build software.",
	})
	_ = writeJobResearch(&state, WriteJobResearchArgs{ResearchSummary: "Role brief."})
	_ = writeMatchAssessment(&state, WriteMatchAssessmentArgs{
		MatchScore: 50, MatchVerdict: VerdictStretch, MatchSummary: "Some fit.",
		Strengths: []string{"Software delivery."},
	})
	_ = writeTailoredResume(&state, WriteTailoredResumeArgs{TailoredResume: "# Lucas Arango"})
	result := writeApplicationDraft(&state, WriteApplicationDraftArgs{Answers: []ApplicationAnswer{
		{Field: "Email", Answer: "lucas@example.com", Evidence: "User profile email", Sensitive: true},
		{Field: " email ", Answer: "other@example.com", Evidence: "User profile email", Sensitive: true},
	}})
	if result.OK || result.Error == nil || result.Error.Code != "duplicate_application_field" {
		t.Fatalf("duplicate fields result = %#v", result)
	}
}

func TestReadyRequiresProposedResumeButNotApplicationAnswers(t *testing.T) {
	state := Defaults()
	_ = setTargetJob(&state, SetTargetJobArgs{
		TargetTitle: "Engineer", Company: "Example", JobDescription: "Build software.",
	})
	_ = writeJobResearch(&state, WriteJobResearchArgs{ResearchSummary: "Role brief."})
	_ = writeMatchAssessment(&state, WriteMatchAssessmentArgs{
		MatchScore: 80, MatchVerdict: VerdictMatch, MatchSummary: "Good fit.",
		Strengths: []string{"Documented software delivery."},
	})
	result := markReady(&state, MarkReadyArgs{ReviewSummary: "Ready"})
	if result.OK || result.Error == nil || result.Error.Code != "tailored_resume_required" {
		t.Fatalf("missing resume result = %#v", result)
	}
	_ = writeTailoredResume(&state, WriteTailoredResumeArgs{TailoredResume: "# Lucas Arango"})
	result = markReady(&state, MarkReadyArgs{ReviewSummary: "Review the proposal."})
	if !result.OK || state.Status != StatusReady || len(state.Answers) != 0 {
		t.Fatalf("resume-only ready result = %#v; state = %#v", result, state)
	}
}
