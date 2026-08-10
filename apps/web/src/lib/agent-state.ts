// Coercion helpers that turn an agent's untyped (`any`) shared state into the
// strongly-typed state shapes the UI renders. ADK streams partial deltas, so we
// read each field defensively and fall back to sensible defaults rather than
// asserting the raw value into a typed object. Keeping these pure makes them
// trivially testable and keeps `as` casts out of the page components.

import type {
  CartItem,
  DocStatus,
  FitnessActivity,
  FitnessState,
  FitnessStatus,
  GroceryState,
  JobsState,
  JobsStatus,
  JobCandidate,
  JobCandidateStatus,
  JobMatchVerdict,
  JobWatchlist,
  ApplicationAnswer,
  ApplicationProfile,
  InterviewCoachingStyle,
  InterviewDifficulty,
  InterviewQuestion,
  InterviewQuestionFeedback,
  InterviewRubricScore,
  InterviewState,
  InterviewStatus,
  InterviewStoryNote,
  InterviewTrack,
  JobResearchSource,
  OralBoardsExchange,
  OralBoardsOutcome,
  OralBoardsPhase,
  OralBoardsSkill,
  OralBoardsSkillsetScore,
  OralBoardsState,
  PantryItem,
  ResumeState,
  ResumeStatus,
  TrendsRow,
  TrendsState,
  TrendsStatus,
  TripState,
  WellnessState,
  WellnessStatus,
} from "@agents/types";

/** Type guard for a plain object. Avoids an `as` cast when narrowing `unknown`. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function optionalStr(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalNum(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Returns `value` if it is one of `allowed`, otherwise `fallback`. */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

const DOC_STATUSES: readonly DocStatus[] = ["idle", "drafting", "ready_to_book", "booked"];
const GROCERY_STATUSES = ["idle", "planning", "ready"] as const;
const FITNESS_STATUSES: readonly FitnessStatus[] = ["idle", "syncing", "planning", "ready"];
const FITNESS_SOURCES = ["health_connect", "healthkit", "strava", "strava_import"] as const;
const WELLNESS_STATUSES: readonly WellnessStatus[] = ["idle", "delegating", "planning", "ready"];
const ORAL_PHASES: readonly OralBoardsPhase[] = [
  "idle",
  "presenting",
  "questioning",
  "feedback",
  "complete",
];
const ORAL_SKILLS: readonly OralBoardsSkill[] = [
  "remember",
  "understand_apply",
  "analyze_evaluate",
];
const ORAL_OUTCOMES: readonly OralBoardsOutcome[] = ["pass", "borderline", "not_yet"];
const RESUME_STATUSES: readonly ResumeStatus[] = ["idle", "analyzing", "ready"];
const JOBS_STATUSES: readonly JobsStatus[] = [
  "idle",
  "researching",
  "matching",
  "drafting",
  "ready",
];
const JOB_MATCH_VERDICTS: readonly JobMatchVerdict[] = ["strong_match", "match", "stretch", "skip"];
const JOB_CANDIDATE_STATUSES: readonly JobCandidateStatus[] = ["new", "shortlisted", "dismissed"];
const INTERVIEW_TRACKS: readonly InterviewTrack[] = ["behavioral", "coding"];
const INTERVIEW_DIFFICULTIES: readonly (InterviewDifficulty | "")[] = [
  "",
  "easy",
  "medium",
  "hard",
];
const INTERVIEW_STYLES: readonly InterviewCoachingStyle[] = ["interview", "guided"];
const INTERVIEW_STATUSES: readonly InterviewStatus[] = [
  "idle",
  "practicing",
  "feedback",
  "complete",
];
const TRENDS_STATUSES: readonly TrendsStatus[] = ["idle", "querying", "ready", "empty", "error"];

export function asDocStatus(value: unknown): DocStatus {
  return oneOf(value, DOC_STATUSES, "idle");
}

export function toTripState(raw: unknown): TripState {
  const s = asRecord(raw);
  return {
    destination: str(s.destination),
    start_date: str(s.start_date),
    end_date: str(s.end_date),
    travelers: num(s.travelers),
    budget_usd: num(s.budget_usd),
    headline: str(s.headline),
    summary: str(s.summary),
    itinerary: str(s.itinerary),
    flights: str(s.flights),
    status: asDocStatus(s.status),
    review_summary: optionalStr(s.review_summary),
  };
}

function toCartItem(raw: unknown): CartItem {
  const s = asRecord(raw);
  return {
    name: str(s.name),
    quantity: num(s.quantity),
    price: optionalNum(s.price),
    upc: optionalStr(s.upc),
  };
}

function toPantryItem(raw: unknown): PantryItem {
  const s = asRecord(raw);
  return {
    name: str(s.name),
    quantity: str(s.quantity),
    expires: optionalStr(s.expires),
  };
}

export function toGroceryState(raw: unknown): GroceryState {
  const s = asRecord(raw);
  return {
    shopping_list: strArray(s.shopping_list),
    cart: Array.isArray(s.cart) ? s.cart.map(toCartItem) : [],
    pantry: Array.isArray(s.pantry) ? s.pantry.map(toPantryItem) : [],
    meal_plan: str(s.meal_plan),
    weekly_deals: str(s.weekly_deals),
    status: oneOf(s.status, GROCERY_STATUSES, "idle"),
    notes: str(s.notes),
    review_summary: optionalStr(s.review_summary),
    kroger_connected: bool(s.kroger_connected),
  };
}

function toFitnessActivity(raw: unknown): FitnessActivity {
  const s = asRecord(raw);
  return {
    id: str(s.id),
    source: FITNESS_SOURCES.find((source) => source === s.source),
    name: str(s.name),
    sport_type: optionalStr(s.sport_type),
    start_date: optionalStr(s.start_date),
    end_date: optionalStr(s.end_date),
    distance_m: optionalNum(s.distance_m),
    moving_time_s: optionalNum(s.moving_time_s),
    elapsed_time_s: optionalNum(s.elapsed_time_s),
    total_elevation_gain_m: optionalNum(s.total_elevation_gain_m),
    average_heartrate: optionalNum(s.average_heartrate),
    perceived_effort: optionalNum(s.perceived_effort),
    data_origin: optionalStr(s.data_origin),
  };
}

export function toFitnessState(raw: unknown): FitnessState {
  const s = asRecord(raw);
  return {
    fitness_data_connected: bool(s.fitness_data_connected),
    activity_source: optionalStr(s.activity_source),
    activities: Array.isArray(s.activities) ? s.activities.map(toFitnessActivity) : [],
    activities_synced_at: optionalStr(s.activities_synced_at),
    objective_research: str(s.objective_research),
    training_plan: str(s.training_plan),
    status: oneOf(s.status, FITNESS_STATUSES, "idle"),
    review_summary: optionalStr(s.review_summary),
  };
}

export function toWellnessState(raw: unknown): WellnessState {
  const s = asRecord(raw);
  return {
    status: oneOf(s.status, WELLNESS_STATUSES, "idle"),
    meal_plan: str(s.meal_plan),
    training_plan: str(s.training_plan),
    weekly_plan: str(s.weekly_plan),
    review_summary: optionalStr(s.review_summary),
    kroger_connected: bool(s.kroger_connected),
    fitness_data_connected: bool(s.fitness_data_connected),
    activity_source: optionalStr(s.activity_source),
  };
}

export function toResumeState(raw: unknown): ResumeState {
  const state = asRecord(raw);
  return {
    target_role: str(state.target_role),
    job_description: str(state.job_description),
    fit_summary: str(state.fit_summary),
    gaps: strArray(state.gaps),
    tailored_bullets: strArray(state.tailored_bullets),
    status: oneOf(state.status, RESUME_STATUSES, "idle"),
    review_summary: str(state.review_summary),
  };
}

function toApplicationProfile(raw: unknown): ApplicationProfile {
  const state = asRecord(raw);
  return {
    full_name: str(state.full_name),
    email: str(state.email),
    phone: str(state.phone),
    location: str(state.location),
    linkedin_url: str(state.linkedin_url),
    github_url: str(state.github_url),
    portfolio_url: str(state.portfolio_url),
    work_authorization: str(state.work_authorization),
    sponsorship: str(state.sponsorship),
    remote_preference: str(state.remote_preference),
    relocation: str(state.relocation),
    salary_expectation: str(state.salary_expectation),
    voice_notes: str(state.voice_notes),
    additional_facts: strArray(state.additional_facts),
  };
}

function toApplicationAnswer(raw: unknown): ApplicationAnswer {
  const state = asRecord(raw);
  return {
    field: str(state.field),
    answer: str(state.answer),
    evidence: str(state.evidence),
    sensitive: bool(state.sensitive),
  };
}

function toJobResearchSource(raw: unknown): JobResearchSource {
  const state = asRecord(raw);
  return {
    title: str(state.title),
    url: str(state.url),
    summary: str(state.summary),
  };
}

function toJobWatchlist(raw: unknown): JobWatchlist {
  const state = asRecord(raw);
  return {
    roles: strArray(state.roles),
    locations: strArray(state.locations),
    remote_only: bool(state.remote_only),
    company_preferences: strArray(state.company_preferences),
    must_have: strArray(state.must_have),
    exclude: strArray(state.exclude),
    minimum_salary_usd: num(state.minimum_salary_usd),
    max_results: num(state.max_results, 10),
  };
}

function toJobCandidate(raw: unknown): JobCandidate {
  const state = asRecord(raw);
  return {
    id: str(state.id),
    title: str(state.title),
    company: str(state.company),
    location: str(state.location),
    url: str(state.url),
    posted_at: str(state.posted_at),
    compensation: str(state.compensation),
    summary: str(state.summary),
    match_score: num(state.match_score),
    why_match: strArray(state.why_match),
    concerns: strArray(state.concerns),
    sources: Array.isArray(state.sources) ? state.sources.map(toJobResearchSource) : [],
    match_verdict: oneOf(state.match_verdict, JOB_MATCH_VERDICTS, "stretch"),
    status: oneOf(state.status, JOB_CANDIDATE_STATUSES, "new"),
  };
}

export function toJobsState(raw: unknown): JobsState {
  const state = asRecord(raw);
  return {
    profile: toApplicationProfile(state.profile),
    watchlist: toJobWatchlist(state.watchlist),
    inbox: Array.isArray(state.inbox) ? state.inbox.map(toJobCandidate) : [],
    inbox_refreshed_at: str(state.inbox_refreshed_at),
    workspace_summary: str(state.workspace_summary),
    target_title: str(state.target_title),
    company: str(state.company),
    job_url: str(state.job_url),
    job_description: str(state.job_description),
    research_summary: str(state.research_summary),
    sources: Array.isArray(state.sources) ? state.sources.map(toJobResearchSource) : [],
    match_score: num(state.match_score),
    match_verdict: oneOf(state.match_verdict, JOB_MATCH_VERDICTS, "stretch"),
    match_summary: str(state.match_summary),
    strengths: strArray(state.strengths),
    gaps: strArray(state.gaps),
    tailored_resume: str(state.tailored_resume),
    application_draft: str(state.application_draft),
    answers: Array.isArray(state.answers) ? state.answers.map(toApplicationAnswer) : [],
    status: oneOf(state.status, JOBS_STATUSES, "idle"),
    review_summary: str(state.review_summary),
  };
}

function toInterviewQuestion(raw: unknown): InterviewQuestion {
  const state = asRecord(raw);
  return {
    id: str(state.id),
    title: str(state.title),
    prompt: str(state.prompt),
    topic: str(state.topic),
    competency: str(state.competency),
    examples: strArray(state.examples),
    constraints: strArray(state.constraints),
    track: oneOf(state.track, INTERVIEW_TRACKS, "behavioral"),
    difficulty: oneOf(state.difficulty, INTERVIEW_DIFFICULTIES, ""),
  };
}

function toInterviewRubricScore(raw: unknown): InterviewRubricScore {
  const state = asRecord(raw);
  return {
    dimension: str(state.dimension),
    score: num(state.score),
    evidence: str(state.evidence),
  };
}

function toInterviewStoryNote(raw: unknown): InterviewStoryNote | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  return {
    title: str(raw.title),
    facts: strArray(raw.facts),
  };
}

function toInterviewQuestionFeedback(raw: unknown): InterviewQuestionFeedback {
  const state = asRecord(raw);
  return {
    question_id: str(state.question_id),
    question_title: str(state.question_title),
    attempt_summary: str(state.attempt_summary),
    rubric: Array.isArray(state.rubric) ? state.rubric.map(toInterviewRubricScore) : [],
    overall_score: num(state.overall_score),
    feedback: str(state.feedback),
    strengths: strArray(state.strengths),
    improvements: strArray(state.improvements),
    follow_up: str(state.follow_up),
    story_note: toInterviewStoryNote(state.story_note),
  };
}

export function toInterviewState(raw: unknown): InterviewState {
  const state = asRecord(raw);
  return {
    track: INTERVIEW_TRACKS.find((track) => track === state.track),
    target_role: str(state.target_role),
    target_level: str(state.target_level),
    topics: strArray(state.topics),
    difficulty: oneOf(state.difficulty, INTERVIEW_DIFFICULTIES, ""),
    coaching_style: INTERVIEW_STYLES.find((style) => style === state.coaching_style),
    target_question_count: num(state.target_question_count),
    current_question: isRecord(state.current_question)
      ? toInterviewQuestion(state.current_question)
      : null,
    active_feedback: isRecord(state.active_feedback)
      ? toInterviewQuestionFeedback(state.active_feedback)
      : null,
    history: Array.isArray(state.history) ? state.history.map(toInterviewQuestionFeedback) : [],
    hint_level: num(state.hint_level),
    active_hint: str(state.active_hint),
    completed_count: num(state.completed_count),
    average_score: num(state.average_score),
    status: oneOf(state.status, INTERVIEW_STATUSES, "idle"),
    session_summary: str(state.session_summary),
    next_steps: strArray(state.next_steps),
  };
}

function toTrendsRow(raw: unknown): TrendsRow {
  const source = asRecord(raw);
  const row: TrendsRow = {};
  for (const [key, value] of Object.entries(source)) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      row[key] = value;
    }
  }
  return row;
}

export function toTrendsState(raw: unknown): TrendsState {
  const state = asRecord(raw);
  return {
    query: str(state.query),
    generated_sql: str(state.generated_sql),
    columns: strArray(state.columns),
    rows: Array.isArray(state.rows) ? state.rows.map(toTrendsRow) : [],
    insights: str(state.insights),
    status: oneOf(state.status, TRENDS_STATUSES, "idle"),
    error: str(state.error),
  };
}

function toOralExchange(raw: unknown): OralBoardsExchange {
  const exchange = asRecord(raw);
  const score = num(exchange.score);
  return {
    question: str(exchange.question),
    answer: str(exchange.answer),
    feedback: str(exchange.feedback),
    ideal_response: str(exchange.ideal_response),
    skillset: optionalStr(exchange.skillset),
    skill: ORAL_SKILLS.find((value) => value === exchange.skill),
    score: score === 1 || score === 2 || score === 3 ? score : undefined,
  };
}

function toSkillsetScore(raw: unknown): OralBoardsSkillsetScore | undefined {
  const score = asRecord(raw);
  const value = num(score.score);
  if (value !== 1 && value !== 2 && value !== 3) return undefined;
  return {
    skillset: str(score.skillset),
    skill: ORAL_SKILLS.find((item) => item === score.skill),
    score: value,
    rationale: str(score.rationale),
  };
}

export function toOralBoardsState(raw: unknown): OralBoardsState {
  const state = asRecord(raw);
  return {
    case: str(state.case),
    transcript: Array.isArray(state.transcript) ? state.transcript.map(toOralExchange) : [],
    score_card: str(state.score_card),
    score_summary: Array.isArray(state.score_summary)
      ? state.score_summary
          .map(toSkillsetScore)
          .filter((value): value is OralBoardsSkillsetScore => value !== undefined)
      : [],
    outcome: ORAL_OUTCOMES.find((value) => value === state.outcome),
    status: oneOf(state.status, ORAL_PHASES, "idle"),
    loading_step: str(state.loading_step),
    current_question: str(state.current_question),
    interview_complete: bool(state.interview_complete),
    active_feedback: str(state.active_feedback),
    active_ideal_response: str(state.active_ideal_response),
    active_probe: str(state.active_probe),
  };
}
