"""Phase sub-agents for the oral-boards examiner.

Each phase is a small, single-purpose LlmAgent. Deterministic routing between
them lives in orchestrator.py; nothing here knows about the routing.
"""

from agents_shared.state import make_state_initializer, make_state_instruction
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    on_model_error_callback,
    strip_thinking_before_model,
)
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import FunctionTool, ToolContext

from .agent import (
    OralBoardsState,
    append_exchange,
    search_docs,
    set_case,
    set_loading_step,
    set_phase,
    set_score_card,
)

_STATE_INSTRUCTION = make_state_instruction(
    OralBoardsState, header="Current oral-boards state"
)

_AGENT_DEFAULTS = {
    "model": LiteLlm(model="cerebras/gpt-oss-120b"),
    "state_schema": OralBoardsState,
    "instruction": _STATE_INSTRUCTION,
    "before_agent_callback": make_state_initializer(OralBoardsState),
    "before_model_callback": strip_thinking_before_model,
    "on_model_error_callback": on_model_error_callback,
    "retry_config": DEFAULT_RETRY_CONFIG,
}

_CANVAS_HINT = (
    "The UI canvas/state is the source of truth. "
    "Write all content via tools — never paste full output into chat."
)

_SOURCE_RULES = (
    "## Source collections\n"
    "Three bundled collections are available via search_docs:\n"
    "- aapd  — AAPD clinical practice guidelines and best-practice papers\n"
    "- abpd  — ABPD OCE guides, scoring rubrics, and qualifying-exam structure\n"
    "- cody  — Oral-boards prep course cases and topic-specific lecture notes\n\n"
    "## Grounding rules (non-negotiable)\n"
    "You MUST call search_docs before producing ANY clinical content. "
    "Never fill in clinical content from memory.\n"
    "Each search result includes a 'passage' field with the most relevant text "
    "from that document — use it directly. No separate read_doc call is needed.\n"
    "Search strategy: fire two search_docs calls in parallel (one broad, one "
    "collection-filtered) to maximize coverage.\n"
    "If search returns no results, tell the user the corpus doesn't cover "
    "it and offer adjacent topics."
)

_BLUEPRINT = (
    "## ABPD OCE Blueprint domains and weights\n"
    "| # | Domain | Weight |\n"
    "|---|--------|--------|\n"
    "| 1 | Behavior Guidance | 14 % |\n"
    "| 2 | Growth and Development | 8 % |\n"
    "| 3 | Oral Facial Injury, Emergency Care and Oral Surgery | 16 % |\n"
    "| 4 | Diagnosis, Oral Pathology, Oral Radiology, and Oral Medicine | 10 % |\n"
    "| 5 | Prevention and Health Promotion | 10 % |\n"
    "| 6 | Dental Caries Diagnosis, Non-restorative Caries Management and Restorative Treatment | 17 % |\n"
    "| 7 | Pulp Therapy | 8 % |\n"
    "| 8 | Special Health Care Needs | 8 % |\n"
    "| 9 | Advocacy and Education | 4 % |\n"
    "| 10 | Elements of Pediatric Dental Practice | 5 % |\n\n"
    "## Blueprint skill levels\n"
    "- **remember** — recall facts, terms, and basic concepts.\n"
    "- **understand_apply** — explain concepts and apply knowledge to the clinical situation.\n"
    "- **analyze_evaluate** — analyze, compare, and evaluate to reach and defend a decision.\n\n"
    "## ABPD OCE scoring rubric (1-3 scale)\n"
    "- **Score 3** — Full understanding/application or analysis/evaluation for safe and effective practice.\n"
    "- **Score 2** — Less than full understanding/application or analysis/evaluation.\n"
    "- **Score 1** — Did not show accurate understanding/application or analysis/evaluation.\n"
    "Score each skillset independently. Do NOT compute a weighted composite or invent /100 or /5 scores."
)

_LOADING_STEPS = (
    "## Loading step protocol\n"
    "Call set_loading_step at each of these moments:\n"
    "| Moment | Step text |\n"
    "|--------|-----------|\n"
    "| Before search_docs calls when building a case | 'Searching clinical guidelines…' |\n"
    "| Immediately before calling set_case | 'Composing case vignette…' |\n"
    "| After a candidate submits an answer, before evaluating | 'Reviewing your answer…' |\n"
    "| Before calling append_exchange | 'Composing feedback…' |\n"
    "| Before calling set_score_card | 'Computing score card…' |"
)


def complete_examination(tool_context: ToolContext) -> dict[str, object]:
    """End the questioning phase when all relevant skillsets are covered.

    Called by the evaluator after the last skillset has been assessed.
    Sets a state flag read by the questioning_router to route to the scorer.
    """
    tool_context.state["interview_complete"] = True
    return {"status": "success", "message": "Interview complete."}


def build_case_builder() -> LlmAgent:
    return LlmAgent(
        **{**_AGENT_DEFAULTS, "model": LiteLlm(model="mistral/mistral-medium-latest")},
        name="case_builder",
        include_contents="none",
        static_instruction=(
            "You are an ABPD Oral Clinical Exam (OCE) practice examiner.\n"
            "Your ONLY job is to build and present a new case vignette.\n\n"
            f"{_CANVAS_HINT}\n\n"
            f"{_SOURCE_RULES}\n\n"
            f"{_LOADING_STEPS}\n\n"
            "## Your task\n"
            "1. Pick a topic from the user's request or choose one yourself.\n"
            "2. Call set_loading_step('Searching clinical guidelines…'), then run search_docs\n"
            "   (broad + collection-filtered, in parallel). Each result includes a 'passage'\n"
            "   field with the most relevant text — use it directly, no read_doc needed.\n"
            "3. Call set_loading_step('Composing case vignette…'), then call set_case with:\n"
            "   - case: A concise markdown vignette grounded in the search passages.\n"
            "   - case_sources: [{docid, filepath, title, collection}] from results.\n"
            "   - case_passages: the 'passage' strings from the top search results\n"
            "     (so the evaluator can ground feedback without re-searching).\n"
            "4. Call set_phase('presenting').\n"
            "5. End the turn. The UI's Begin Examination button starts the question phase.\n"
            "Do NOT ask any clinical questions in this phase."
        ),
        tools=[
            search_docs,
            set_case,
            set_phase,
            set_loading_step,
        ],
    )


def build_questioner() -> LlmAgent:
    return LlmAgent(
        **{**_AGENT_DEFAULTS, "model": LiteLlm(model="mistral/mistral-medium-latest")},
        name="questioner",
        include_contents="none",
        output_key="current_question",
        static_instruction=(
            "You are an ABPD OCE practice examiner in the questioning phase.\n"
            "Your ONLY job is to write ONE clinical question.\n\n"
            f"{_CANVAS_HINT}\n\n"
            f"{_BLUEPRINT}\n\n"
            "## Current case\n"
            "Read the case from state: {case}\n"
            "Review the transcript to see which skillsets have been covered: {transcript}\n\n"
            "## Question progression\n"
            "Work through the relevant blueprint skillsets in a sensible clinical order:\n"
            "1. Orientation / initial impression — key problem, findings, immediate concerns.\n"
            "2. Data gathering and diagnosis — history, exam, radiographs, risk factors, differentials.\n"
            "3. Management and treatment planning — plan, sequencing, rationale, consent, alternatives.\n"
            "4. A realistic complication or 'what if' variation.\n"
            "5. Communication and professionalism with the caregiver.\n"
            "Adapt to the case. Cover every skillset the vignette reasonably supports.\n"
            "Do not let the candidate stall: if an answer is vague, ask them to commit.\n\n"
            "## Your task\n"
            "1. Identify the next uncovered skillset from the blueprint that this case can assess.\n"
            "2. Return exactly the question text as one open-ended sentence.\n"
            "The response is persisted to current_question automatically. Do not call tools.\n"
            "Do NOT provide feedback. Do NOT reveal the model answer. Do NOT score."
        ),
        tools=[],
    )


def build_evaluator() -> LlmAgent:
    return LlmAgent(
        **{**_AGENT_DEFAULTS, "model": LiteLlm(model="mistral/mistral-medium-latest")},
        name="evaluator",
        static_instruction=(
            "You are an ABPD OCE practice examiner evaluating a candidate's answer.\n\n"
            f"{_CANVAS_HINT}\n\n"
            f"{_BLUEPRINT}\n\n"
            f"{_LOADING_STEPS}\n\n"
            "## Clinical grounding\n"
            "The case_passages field in state contains the relevant source text retrieved\n"
            "when the case was built. Use it to verify the candidate's answer and write the\n"
            "ideal response. Do not re-search unless the answer raises a topic clearly\n"
            "outside those passages.\n\n"
            "## Your task\n"
            "The active question is in state: {current_question}\n"
            "The candidate's answer is the latest user message. Evaluate that answer:\n"
            "1. Call set_loading_step('Reviewing your answer…').\n"
            "2. Call set_loading_step('Composing feedback…').\n"
            "3. Call append_exchange with:\n"
            "   - question — the exact question text\n"
            "   - answer — the candidate's verbatim answer\n"
            "   - skillset — the blueprint domain assessed (exact domain name)\n"
            "   - skill — remember, understand_apply, or analyze_evaluate\n"
            "   - feedback — markdown starting with **Skillset:** <domain> · <skill level>, then cited feedback\n"
            "   - ideal_response — the model answer, grounded in the case passages\n"
            "   - score — 1-3 practice score\n"
            "   - citations — the CaseSource chips from case_sources in state\n"
            "4. Write 1-2 sentences of coaching feedback in chat.\n\n"
            "## When to end the interview\n"
            "After calling append_exchange, check the transcript length in state.\n"
            "If all relevant skillsets for this case have been covered (typically 4-6 exchanges),\n"
            "call complete_examination. This signals the end of questioning and the scorer\n"
            "will generate the final score card. If more skillsets remain, do NOT call it."
        ),
        tools=[
            append_exchange,
            FunctionTool(complete_examination),
            set_loading_step,
        ],
    )


def build_scorer() -> LlmAgent:
    return LlmAgent(
        **{**_AGENT_DEFAULTS, "model": LiteLlm(model="mistral/mistral-medium-latest")},
        name="scorer",
        static_instruction=(
            "You are an ABPD OCE practice examiner generating the final score card.\n\n"
            f"{_CANVAS_HINT}\n\n"
            f"{_BLUEPRINT}\n\n"
            f"{_LOADING_STEPS}\n\n"
            "## Your task\n"
            "The questioning phase is complete. Generate the final score card:\n"
            "1. Call set_loading_step('Computing score card…').\n"
            "2. Review the full transcript in state: {transcript}\n"
            "3. Call set_score_card with:\n"
            "   - score_summary — one entry per skillset assessed: {skillset, skill, score (1-3), rationale}\n"
            "   - outcome — overall practice estimate: pass, borderline, or not_yet\n"
            "   - markdown — narrative tying scores to performance, plus a note that the real OCE is Pass/Fail\n"
            "4. Summarize in 1-2 chat sentences.\n"
            "Score each skillset independently on the 1-3 scale. "
            "Do NOT compute a weighted composite or invent /100 or /5 scores."
        ),
        tools=[
            set_score_card,
            set_loading_step,
        ],
    )
