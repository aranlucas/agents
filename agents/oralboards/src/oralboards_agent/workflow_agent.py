"""Oral boards examiner — graph-based agent using SequentialAgent + LoopAgent.

Reuses the state model, tools, and search functions from agent.py.
Flow is enforced via ADK orchestration agents instead of prompt instructions:

    case_builder  →  questioning_loop (questioner → evaluator)  →  scorer

- ``request_input`` (long-running tool) pauses the invocation after each
  question so the candidate must respond before the next step runs.
- ``tool_context.actions.escalate = True`` on the evaluator's append_exchange
  call exits the loop when all relevant skillsets are covered.
"""

from agents_shared.state import make_state_initializer, make_state_instruction
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_model,
    on_model_error_callback,
)
from google.adk.agents import LlmAgent, LoopAgent, SequentialAgent
from google.adk.tools import FunctionTool, request_input

from .agent import (
    OralBoardsState,
    append_exchange,
    read_doc,
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
    "model": build_model(),
    "state_schema": OralBoardsState,
    "instruction": _STATE_INSTRUCTION,
    "before_agent_callback": make_state_initializer(OralBoardsState),
    "on_model_error_callback": on_model_error_callback,
    "retry_config": DEFAULT_RETRY_CONFIG,
}

_CANVAS_HINT = (
    "The UI canvas/state is the source of truth. "
    "Write all content via tools — never paste full output into chat."
)

_SOURCE_RULES = (
    "## Source collections\n"
    "Three bundled collections are available via search_docs and read_doc:\n"
    "- aapd  — AAPD clinical practice guidelines and best-practice papers\n"
    "- abpd  — ABPD OCE guides, scoring rubrics, and qualifying-exam structure\n"
    "- cody  — Oral-boards prep course cases and topic-specific lecture notes\n\n"
    "## Grounding rules (non-negotiable)\n"
    "You MUST call search_docs before producing ANY clinical content. "
    "Never fill in clinical content from memory.\n"
    "Search strategy: fire search_docs calls in parallel (one broad, one "
    "collection-filtered). Call read_doc on the most relevant filepath(s) "
    "in parallel.\n"
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
    "| Before the first search_docs call when building a case | 'Searching clinical guidelines…' |\n"
    "| Before each read_doc call | 'Reading: <document title>…' |\n"
    "| Immediately before calling set_case | 'Composing case vignette…' |\n"
    "| After a candidate submits an answer, before re-searching | 'Reviewing your answer…' |\n"
    "| Before calling append_exchange | 'Composing feedback…' |\n"
    "| Before calling set_score_card | 'Computing score card…' |"
)


def _build_case_builder() -> LlmAgent:
    return LlmAgent(
        **_AGENT_DEFAULTS,
        name="case_builder",
        static_instruction=(
            "You are an ABPD Oral Clinical Exam (OCE) practice examiner.\n"
            "Your ONLY job is to build and present a new case vignette.\n\n"
            f"{_CANVAS_HINT}\n\n"
            f"{_SOURCE_RULES}\n\n"
            f"{_LOADING_STEPS}\n\n"
            "## Your task\n"
            "1. Pick a topic from the user's request or choose one yourself.\n"
            "2. Call set_loading_step, then run search_docs (broad + collection-filtered, in parallel).\n"
            "3. Call read_doc on the top results (in parallel).\n"
            "4. Call set_loading_step('Composing case vignette…'), then call set_case with:\n"
            "   - A concise markdown vignette grounded in what you read.\n"
            "   - Source chips: [{docid, filepath, title, collection}].\n"
            "5. Call set_phase('presenting').\n"
            "6. Present the case in 2-3 natural sentences as a real examiner would.\n"
            "   Tell the candidate once that real examiners withhold feedback and the real\n"
            "   result is Pass/Fail — this tool coaches to help them learn.\n"
            "7. Call adk_request_input with message='When you are ready to begin the examination, type ready.'\n"
            "   This pauses the session until the candidate responds.\n"
            "Do NOT ask any clinical questions in this phase."
        ),
        tools=[
            FunctionTool(search_docs),
            FunctionTool(read_doc),
            FunctionTool(set_case),
            FunctionTool(set_phase),
            FunctionTool(set_loading_step),
            request_input,
        ],
    )


def _build_questioner() -> LlmAgent:
    return LlmAgent(
        **_AGENT_DEFAULTS,
        name="questioner",
        static_instruction=(
            "You are an ABPD OCE practice examiner in the questioning phase.\n"
            "Your ONLY job is to ask ONE clinical question and wait for the candidate's answer.\n\n"
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
            "2. Write ONLY the question in chat — one open-ended sentence, no elaboration.\n"
            "3. Call adk_request_input with message=<the exact question text>.\n"
            "   This pauses the session until the candidate answers.\n"
            "4. After the tool returns the candidate's answer, say nothing more. End your turn.\n"
            "Do NOT provide feedback. Do NOT reveal the model answer. Do NOT score."
        ),
        tools=[request_input],
    )


def _build_evaluator() -> LlmAgent:
    return LlmAgent(
        **_AGENT_DEFAULTS,
        name="evaluator",
        static_instruction=(
            "You are an ABPD OCE practice examiner evaluating a candidate's answer.\n\n"
            f"{_CANVAS_HINT}\n\n"
            f"{_SOURCE_RULES}\n\n"
            f"{_BLUEPRINT}\n\n"
            f"{_LOADING_STEPS}\n\n"
            "## Your task\n"
            "The candidate just answered a clinical question. Evaluate their answer:\n"
            "1. Call set_loading_step('Reviewing your answer…').\n"
            "2. Re-search or reuse existing docs to verify the answer.\n"
            "3. Call set_loading_step('Composing feedback…').\n"
            "4. Call append_exchange with:\n"
            "   - question — the exact question text\n"
            "   - answer — the candidate's verbatim answer\n"
            "   - skillset — the blueprint domain assessed (exact domain name)\n"
            "   - skill — remember, understand_apply, or analyze_evaluate\n"
            "   - feedback — markdown starting with **Skillset:** <domain> · <skill level>, then cited feedback\n"
            "   - ideal_response — the model answer, grounded in sourced documents\n"
            "   - score — 1-3 practice score\n"
            "   - citations — the CaseSource chips you used\n"
            "5. Write 1-2 sentences of coaching feedback in chat.\n\n"
            "## When to end the interview\n"
            "After calling append_exchange, check the transcript length in state.\n"
            "If all relevant skillsets for this case have been covered (typically 4-6 exchanges),\n"
            "set tool_context.actions.escalate = True inside the append_exchange tool call.\n"
            "This signals the loop to exit and the scorer will generate the final score card.\n"
            "If more skillsets remain, do NOT set escalate — the loop will continue."
        ),
        tools=[
            FunctionTool(search_docs),
            FunctionTool(read_doc),
            FunctionTool(append_exchange),
            FunctionTool(set_loading_step),
        ],
    )


def _build_scorer() -> LlmAgent:
    return LlmAgent(
        **_AGENT_DEFAULTS,
        name="scorer",
        static_instruction=(
            "You are an ABPD OCE practice examiner generating the final score card.\n\n"
            f"{_CANVAS_HINT}\n\n"
            f"{_SOURCE_RULES}\n\n"
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
            FunctionTool(search_docs),
            FunctionTool(read_doc),
            FunctionTool(set_score_card),
            FunctionTool(set_loading_step),
        ],
    )


def build_workflow_agent() -> SequentialAgent:
    """Graph-based oral-boards examiner with deterministic flow control.

    Flow: case_builder → questioning_loop(questioner → evaluator) → scorer

    - ``request_input`` pauses the invocation after each question so the
      candidate must respond before the next node runs.
    - The evaluator sets ``escalate=True`` on ``append_exchange`` when all
      relevant skillsets are covered, exiting the loop.
    """
    questioner = _build_questioner()
    evaluator = _build_evaluator()

    questioning_loop = LoopAgent(
        name="questioning_loop",
        sub_agents=[questioner, evaluator],
        max_iterations=8,
    )

    return SequentialAgent(
        name="oralboards_workflow",
        sub_agents=[
            _build_case_builder(),
            questioning_loop,
            _build_scorer(),
        ],
    )
