package resume

import (
	"strings"

	"agents/internal/agentruntime"
	"google.golang.org/adk/v2/agent"
)

const (
	maxTargetRoleLength     = 300
	maxJobDescriptionLength = 100_000
	maxFitSummaryLength     = 10_000
	maxAssessmentItems      = 25
	maxGapLength            = 2_000
	maxTailoredBulletLength = 3_000
	maxReviewSummaryLength  = 5_000
)

type Result struct {
	OK     bool                          `json:"ok"`
	Status Status                        `json:"status,omitempty"`
	Error  *agentruntime.StructuredError `json:"error,omitempty"`
}

type SetTargetRoleArgs struct {
	TargetRole     string `json:"target_role"`
	JobDescription string `json:"job_description"`
}

type WriteFitAssessmentArgs struct {
	FitSummary      string   `json:"fit_summary"`
	Gaps            []string `json:"gaps"`
	TailoredBullets []string `json:"tailored_bullets"`
}

type MarkReadyArgs struct {
	ReviewSummary string `json:"review_summary"`
}

func SetTargetRole(ctx agent.Context, input SetTargetRoleArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := setTargetRole(&state, input)
	if err != nil || !result.OK {
		return result, err
	}
	if err := ctx.State().Set("target_role", state.TargetRole); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("job_description", state.JobDescription); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("fit_summary", state.FitSummary); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("gaps", state.Gaps); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("tailored_bullets", state.TailoredBullets); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("status", state.Status); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("review_summary", state.ReviewSummary); err != nil {
		return Result{}, err
	}
	return result, nil
}

func setTargetRole(state *ResumeState, input SetTargetRoleArgs) (Result, error) {
	targetRole := strings.TrimSpace(input.TargetRole)
	if targetRole == "" || len(targetRole) > maxTargetRoleLength {
		return fail("invalid_target_role", "target role is required and must be at most 300 characters"), nil
	}
	jobDescription := strings.TrimSpace(input.JobDescription)
	if jobDescription == "" {
		return fail("job_description_required", "job description is required for a tailored assessment"), nil
	}
	if len(jobDescription) > maxJobDescriptionLength {
		return fail("job_description_too_large", "job description exceeds the 100,000 character limit"), nil
	}

	state.TargetRole = targetRole
	state.JobDescription = jobDescription
	state.FitSummary = ""
	state.Gaps = []string{}
	state.TailoredBullets = []string{}
	state.Status = StatusAnalyzing
	state.ReviewSummary = ""
	return Result{OK: true, Status: state.Status}, nil
}

func WriteFitAssessment(ctx agent.Context, input WriteFitAssessmentArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := writeFitAssessment(&state, input)
	if err != nil || !result.OK {
		return result, err
	}
	if err := ctx.State().Set("fit_summary", state.FitSummary); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("gaps", state.Gaps); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("tailored_bullets", state.TailoredBullets); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("status", state.Status); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("review_summary", state.ReviewSummary); err != nil {
		return Result{}, err
	}
	return result, nil
}

func writeFitAssessment(state *ResumeState, input WriteFitAssessmentArgs) (Result, error) {
	if strings.TrimSpace(state.TargetRole) == "" || strings.TrimSpace(state.JobDescription) == "" {
		return fail("target_job_required", "set a target role and job description before writing an assessment"), nil
	}
	fitSummary := strings.TrimSpace(input.FitSummary)
	if fitSummary == "" || len(fitSummary) > maxFitSummaryLength {
		return fail("invalid_fit_summary", "fit summary is required and must be at most 10,000 characters"), nil
	}
	gaps, result := cleanAssessmentItems(input.Gaps, maxGapLength, false, "gaps")
	if !result.OK {
		return result, nil
	}
	tailoredBullets, result := cleanAssessmentItems(input.TailoredBullets, maxTailoredBulletLength, true, "tailored_bullets")
	if !result.OK {
		return result, nil
	}

	state.FitSummary = fitSummary
	state.Gaps = gaps
	state.TailoredBullets = tailoredBullets
	state.Status = StatusAnalyzing
	state.ReviewSummary = ""
	return Result{OK: true, Status: state.Status}, nil
}

func MarkResumeReady(ctx agent.Context, input MarkReadyArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := markResumeReady(&state, input)
	if err != nil || !result.OK {
		return result, err
	}
	if err := ctx.State().Set("status", state.Status); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("review_summary", state.ReviewSummary); err != nil {
		return Result{}, err
	}
	return result, nil
}

func markResumeReady(state *ResumeState, input MarkReadyArgs) (Result, error) {
	if strings.TrimSpace(state.TargetRole) == "" || len(strings.TrimSpace(state.TargetRole)) > maxTargetRoleLength ||
		strings.TrimSpace(state.JobDescription) == "" || len(strings.TrimSpace(state.JobDescription)) > maxJobDescriptionLength {
		return fail("target_job_required", "a target role and job description are required before marking ready"), nil
	}
	if strings.TrimSpace(state.FitSummary) == "" || len(strings.TrimSpace(state.FitSummary)) > maxFitSummaryLength {
		return fail("fit_summary_required", "a fit summary is required before marking ready"), nil
	}
	gaps, result := cleanAssessmentItems(state.Gaps, maxGapLength, false, "gaps")
	if !result.OK {
		return result, nil
	}
	tailoredBullets, result := cleanAssessmentItems(state.TailoredBullets, maxTailoredBulletLength, true, "tailored_bullets")
	if !result.OK {
		return result, nil
	}
	reviewSummary := strings.TrimSpace(input.ReviewSummary)
	if reviewSummary == "" || len(reviewSummary) > maxReviewSummaryLength {
		return fail("invalid_review_summary", "review summary is required and must be at most 5,000 characters"), nil
	}

	state.TargetRole = strings.TrimSpace(state.TargetRole)
	state.JobDescription = strings.TrimSpace(state.JobDescription)
	state.FitSummary = strings.TrimSpace(state.FitSummary)
	state.Gaps = gaps
	state.TailoredBullets = tailoredBullets
	state.Status = StatusReady
	state.ReviewSummary = reviewSummary
	return Result{OK: true, Status: state.Status}, nil
}

func cleanAssessmentItems(items []string, maxLength int, required bool, field string) ([]string, Result) {
	if len(items) > maxAssessmentItems {
		return nil, fail("too_many_"+field, field+" cannot contain more than 25 items")
	}
	cleaned := make([]string, 0, len(items))
	seen := make(map[string]bool, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item == "" || len(item) > maxLength {
			return nil, fail("invalid_"+field, field+" must contain only non-empty items within the allowed length")
		}
		if !seen[item] {
			seen[item] = true
			cleaned = append(cleaned, item)
		}
	}
	if required && len(cleaned) == 0 {
		return nil, fail(field+"_required", "at least one tailored bullet is required")
	}
	return cleaned, Result{OK: true}
}

func fail(code, message string) Result {
	return Result{Error: &agentruntime.StructuredError{Code: code, Message: message}}
}
