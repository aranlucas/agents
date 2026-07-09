"""Phase sub-agents for the oral-boards examiner.

Each phase is a small, single-purpose LlmAgent. Deterministic routing between
them lives in orchestrator.py; nothing here knows about the routing.
"""

from agents_shared.state import make_state_initializer, make_state_instruction
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    GEMINI_RETRY_OPTIONS,
    on_model_error_callback,
    strip_thinking_before_model,
)
from google.adk.agents import LlmAgent
from google.adk.models.google_llm import Gemini
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import FunctionTool, ToolContext

from .agent import (
    OralBoardsState,
    append_exchange,
    ask_probe,
    search_docs,
    set_case,
    set_loading_step,
    set_phase,
    set_question_target,
    set_score_card,
)

_STATE_INSTRUCTION = make_state_instruction(
    OralBoardsState, header="Current oral-boards state"
)

_AGENT_DEFAULTS = {
    "model": LiteLlm(model="openrouter/tencent/hy3:free"),
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
    "Each search result includes a 'passage' field with the text around the "
    "matched region — use it directly. No separate read_doc call is needed.\n"
    "Results are relevance-ranked with a 'score' (higher = more relevant) and a "
    "single unfiltered call already includes each collection's best hits.\n"
    "Search strategy: you have a HARD BUDGET of 2 search_docs calls — a 3rd call "
    "is rejected. One broad query usually suffices; keep the second call in "
    "reserve for a genuinely different reformulation or a collection filter. "
    "Do NOT re-search if results merely look thin — work with what you have.\n"
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

_VIGNETTE_RULES = (
    "## Vignette rules\n"
    "Audience: the candidate under examination. Write the vignette TO them in\n"
    "second person ('…presents to your office', 'the mother tells you').\n"
    "Reveal only the exam stimulus — what an examiner presents before questioning:\n\n"
    "**Patient:** age, sex, and chief complaint / reason for the visit\n"
    "**History:** medical, dental, social, dietary — as reported\n"
    "**Findings:** objective clinical and radiographic observations\n\n"
    "Report findings neutrally; never interpret them — labeling a case 'classic\n"
    "for ECC' hands the candidate the answer. Withhold anything the candidate\n"
    "must supply during questioning: diagnosis, risk categorization, management\n"
    "plan, preventive/recall advice, citations, discussion points. Supporting\n"
    "source text goes in case_passages, never in the vignette."
)

_QUESTION_CRAFT = (
    "## Question craft (non-negotiable)\n"
    "Ask ONE question testing ONE cognitive act. Never stack two asks ('what\n"
    "would you look for AND how would it change your plan') — the follow-up is\n"
    "a later question or a probe.\n"
    "NEVER include answer content in the question: no 'such as …' example\n"
    "lists, no enumerating findings/diagnoses/materials/techniques the\n"
    "candidate is expected to supply, no embedded differentials. If the\n"
    "question names the items, the candidate can only parrot them back and\n"
    "nothing is assessed.\n"
    "Keep it under ~30 words, open-ended, second person.\n"
    "Self-check before returning: 'Could a weak candidate answer this by\n"
    "repeating words from my question?' If yes, rewrite."
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
        **{
            **_AGENT_DEFAULTS,
            "model": Gemini(
                model="gemini-3.1-flash-lite",
                retry_options=GEMINI_RETRY_OPTIONS,
            ),
        },
        name="case_builder",
        include_contents="none",
        static_instruction=(
            "You are an ABPD Oral Clinical Exam (OCE) practice examiner.\n"
            "Your ONLY job is to build and present a new case vignette.\n\n"
            f"{_CANVAS_HINT}\n\n"
            f"{_SOURCE_RULES}\n\n"
            f"{_VIGNETTE_RULES}\n\n"
            f"{_LOADING_STEPS}\n\n"
            "## Your task\n"
            "1. Pick a topic from the user's request or choose one yourself.\n"
            "2. Call set_loading_step('Searching clinical guidelines…'), then run ONE broad\n"
            "   search_docs query (no collection filter). Results are scored and include each\n"
            "   collection's best hits — cody holds the actual clinical-case narratives,\n"
            "   aapd/abpd are policy and guideline text. Only if the cody results are weak,\n"
            "   spend the second (final) call with collection='cody'. Each result includes a\n"
            "   'passage' field with the matched text — use it directly, no read_doc needed.\n"
            "   You will not find a pre-written case matching the topic exactly — ground the\n"
            "   clinical facts (risk factors, diagnostic criteria, staging) in the passages\n"
            "   and author the vignette yourself.\n"
            "3. Call set_loading_step('Composing case vignette…'), then call set_case with:\n"
            "   - case: A concise candidate-facing markdown vignette grounded in the search\n"
            "     passages, following the vignette rules above (presentation only — no\n"
            "     assessment, plan, or discussion points).\n"
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
        **_AGENT_DEFAULTS,
        name="questioner",
        include_contents="none",
        output_key="current_question",
        static_instruction=(
            "You are an ABPD OCE practice examiner in the questioning phase.\n"
            "Your ONLY job is to write ONE clinical question.\n\n"
            f"{_CANVAS_HINT}\n\n"
            f"{_BLUEPRINT}\n\n"
            f"{_QUESTION_CRAFT}\n\n"
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
            "2. Call set_question_target EXACTLY ONCE with that blueprint domain name\n"
            "   and the cognitive skill level the question will test.\n"
            "3. Then return exactly the question text as one open-ended sentence.\n"
            "The response is persisted to current_question automatically.\n"
            "Do NOT provide feedback. Do NOT reveal the model answer. Do NOT score.\n\n"
            "## Rewrite feedback\n"
            "If the following is non-empty, your previous draft violated question craft —\n"
            "write a NEW question fixing every listed violation: {question_craft_feedback}"
        ),
        tools=[set_question_target],
    )


def build_evaluator() -> LlmAgent:
    return LlmAgent(
        **{**_AGENT_DEFAULTS, "model": LiteLlm(model="mistral/mistral-large-latest")},
        name="evaluator",
        static_instruction=(
            "You are an ABPD OCE practice examiner evaluating a candidate's answer.\n\n"
            f"{_CANVAS_HINT}\n\n"
            f"{_BLUEPRINT}\n\n"
            f"{_LOADING_STEPS}\n\n"
            "## Clinical grounding\n"
            "The case_passages field in state contains the source text retrieved when the\n"
            "case was built. Ground feedback and the ideal response in it whenever it\n"
            "covers the topic.\n"
            "Re-search with search_docs when — and only when — the candidate's answer\n"
            "raises clinical material the stored passages do not cover (a drug, technique,\n"
            "guideline, or complication outside the case's original scope). You have a HARD\n"
            "BUDGET of 2 search_docs calls per exchange — a 3rd call is rejected. One broad\n"
            "query returns scored, collection-diverse results; keep the second call for a\n"
            "genuinely different reformulation. Use the returned 'passage' fields and add\n"
            "the new sources to the exchange's citations.\n"
            "Never fill in clinical content from memory. If neither the stored passages\n"
            "nor a re-search covers the point, say so in the feedback instead of\n"
            "improvising.\n\n"
            "## Probing (one per question, max)\n"
            "If the candidate's answer is partial — it would score 2 because something\n"
            "specific is missing or undefended — you MAY call ask_probe with ONE follow-up\n"
            "question targeting exactly that gap, instead of scoring immediately. Real\n"
            "examiners probe; use it when one more sentence from the candidate would\n"
            "separate a 2 from a 3. The probe question must follow the same\n"
            "question-craft standard the questioner uses: one question, no 'such\n"
            "as …' example lists, no enumerating the missing items — ask the\n"
            "candidate to supply them, don't hand them over.\n\n"
            "## Your task\n"
            "The active question is in state: {current_question}\n"
            "The candidate's answer is the latest user message. Evaluate that answer:\n"
            "1. Call set_loading_step('Reviewing your answer…').\n"
            "2. Decide: probe or score. Exactly one of these three branches applies —\n"
            "   never call both ask_probe and append_exchange in the same turn.\n"
            "   - If active_probe in state is non-empty: the probe was already asked,\n"
            "     and the latest user message IS the candidate's reply to it. You MUST\n"
            "     score now — go to step 3. The merged answer is the original answer\n"
            "     plus the candidate's probe reply, joined as\n"
            '     `original answer + " / " + <the candidate\'s probe reply text>`.\n'
            "     NEVER use the probe QUESTION text in that join — only the candidate's\n"
            "     reply to it.\n"
            "   - Else if the answer is partial (a 2 where one more sentence could earn\n"
            "     a 3): call ask_probe with ONE focused follow-up targeting exactly that\n"
            "     gap, following the question-craft standard above, then END YOUR TURN\n"
            "     IMMEDIATELY — no chat text, no append_exchange. The panel displays the\n"
            "     probe and the candidate's reply arrives as the next user message.\n"
            "   - Else (a clear 1 or a clear 3): go to step 3 and score now.\n"
            "   Never probe an answer that is clearly a 1 or clearly a 3.\n"
            "3. Call set_loading_step('Composing feedback…'), then call append_exchange with:\n"
            "   - question — the exact question text\n"
            "   - answer — the candidate's verbatim answer (merged with the probe reply\n"
            "     per step 2 if this exchange included a probe)\n"
            "   - skillset — the blueprint domain assessed (exact domain name). The\n"
            "     questioner declared its target in state: {target_skillset} — use it\n"
            "     when non-empty; fall back to your own judgment only if it is empty.\n"
            "   - skill — remember, understand_apply, or analyze_evaluate. Prefer the\n"
            "     declared target in state: {target_skill} — fall back to your own\n"
            "     judgment only if it is empty.\n"
            "   - feedback — markdown with this exact structure:\n"
            "     **Skillset:** <domain> · <skill level>\n"
            "     **What you said:** one sentence crediting what was correct or relevant.\n"
            "     **What was missing:** the specific gap that set the score, each point\n"
            "     backed by a short direct quote from the case passages or re-searched\n"
            '     passages ("...") with its source title.\n'
            "     **What a 3 sounds like:** 2-3 sentences a full-marks candidate would\n"
            "     actually say — concrete, committed, and clinically sequenced. Do not\n"
            "     restate the ideal_response verbatim; this is the spoken version.\n"
            "     **Technique tip:** one transferable exam-technique pointer drawn from\n"
            "     THIS answer's main weakness (e.g. 'commit to a decision and defend\n"
            "     it', 'tie each finding you name to how it changes your plan', \"don't\n"
            "     restate the question's terms — add the implication\").\n"
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
            search_docs,
            ask_probe,
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
            "   - markdown — narrative tying scores to performance, plus a note that the real\n"
            "     OCE is Pass/Fail. The narrative MUST end with a short '## Answer technique\n"
            "     coaching' section: 2-3 recurring answering-technique patterns observed\n"
            "     across the whole transcript, with concrete advice on how to structure a\n"
            "     3-level answer — commit to a decision, anchor it to this patient's\n"
            "     findings, justify with a guideline or mechanism, and close the loop with\n"
            "     if-present/if-absent management. This section is about answering\n"
            "     technique, NOT a restatement of clinical content.\n"
            "4. Summarize in 1-2 chat sentences.\n"
            "Score each skillset independently on the 1-3 scale. "
            "Do NOT compute a weighted composite or invent /100 or /5 scores."
        ),
        tools=[
            set_score_card,
            set_loading_step,
        ],
    )
