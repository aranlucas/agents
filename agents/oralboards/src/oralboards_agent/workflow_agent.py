"""Oral boards examiner — Workflow-based agent.

Reuses the state model, tools, and search functions from agent.py.
Flow is enforced via ADK Workflow graph:

    case_builder  →  questioner  →  evaluator  →  router  →  scorer

The router checks whether ``complete_examination`` was called by the
evaluator and either loops back to the questioner or proceeds to the scorer.

- The frontend ``ask_question`` HITL tool pauses the invocation after each
  question so the candidate must respond before the next step runs.
- ``complete_examination`` sets a state flag that the router reads.
"""

from typing import Any

from agents_shared.state import make_state_initializer, make_state_instruction
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    on_model_error_callback,
    strip_thinking_before_model,
)
from google.adk import Workflow
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import FunctionTool, ToolContext
from google.adk.workflow import START, FunctionNode
from pydantic import ConfigDict, Field

from .agent import (
    OralBoardsState,
    append_exchange,
    search_docs,
    set_case,
    set_loading_step,
    set_phase,
    set_score_card,
)


class _WorkflowWithSubAgents(Workflow):
    """Workflow subclass that exposes graph nodes as ``sub_agents`` for ag_ui_adk.

    ag_ui_adk's ``_shallow_copy_agent_tree`` and ``_update_agent_tools_recursive``
    traverse ``sub_agents`` but not ``Workflow.graph.nodes``.  Without this shim,
    ``AGUIToolset`` placeholders inside Workflow nodes are never replaced with the
    per-run ``ClientProxyToolset`` and ``ask_question`` raises
    ``ValueError: Tool 'ask_question' not found``.

    This subclass exposes the graph's ``LlmAgent`` nodes via ``sub_agents`` and
    syncs any write-back into ``graph.nodes`` so that the Workflow executor (which
    calls ``_get_static_node_by_name`` → iterates ``graph.nodes``) uses the updated,
    tool-replaced copies.

    ``model_copy`` also clones the graph so each run has its own independent nodes
    list — preventing concurrent requests from mutating the shared singleton.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    # ADK's BaseAgent.root_agent walks parent_agent upward until None.
    # Workflow (BaseNode) has no parent_agent, so we declare it here so the
    # traversal terminates at the Workflow root instead of raising AttributeError.
    parent_agent: Any = Field(default=None, exclude=True)

    def model_post_init(self, __context: Any, /) -> None:
        super().model_post_init(__context)
        nodes = [
            n for n in (self.graph.nodes if self.graph else []) if hasattr(n, "tools")
        ]
        object.__setattr__(self, "_sub_agents", nodes)

    def __setattr__(self, name: str, value: Any) -> None:
        if name == "sub_agents":
            object.__setattr__(self, "_sub_agents", value)
            # Sync the per-run copies back into graph.nodes so the Workflow
            # executor's _get_static_node_by_name finds them (lookup is by name).
            if self.graph is not None and value:
                name_to_new = {n.name: n for n in value if hasattr(n, "name")}
                object.__setattr__(
                    self.graph,
                    "nodes",
                    [name_to_new.get(n.name, n) for n in self.graph.nodes],
                )
        else:
            super().__setattr__(name, value)

    @property
    def sub_agents(self) -> list[Any]:
        return getattr(self, "_sub_agents", [])

    def model_copy(
        self, *, deep: bool = False, **kwargs: Any
    ) -> _WorkflowWithSubAgents:
        copied: _WorkflowWithSubAgents = super().model_copy(deep=deep, **kwargs)
        if copied.graph is not None:
            # Give the copy its own Graph with an independent nodes list so the
            # sub_agents setter can update graph.nodes without touching the
            # shared original.  Pydantic's model_copy does NOT call
            # model_post_init, so Graph.model_post_init's "nodes already set"
            # guard never fires and _terminal_node_names is correctly carried
            # over via __pydantic_private__.
            fresh_graph = copied.graph.model_copy(deep=False)
            object.__setattr__(fresh_graph, "nodes", list(fresh_graph.nodes))
            object.__setattr__(copied, "graph", fresh_graph)
        nodes = [
            n
            for n in (copied.graph.nodes if copied.graph else [])
            if hasattr(n, "tools")
        ]
        object.__setattr__(copied, "_sub_agents", nodes)
        return copied


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


def questioning_router(ctx: ToolContext) -> str:
    """Read the interview_complete flag and set the route accordingly.

    Returns:
        ``""`` (the route is communicated via ``ctx.route``, not the return value).
    """
    if ctx.state.get("interview_complete"):
        ctx.route = "complete"
    else:
        ctx.route = "continue"
    return ""


def workflow_entry_router(ctx: ToolContext) -> str:
    """Route a new invocation from the persisted exam phase."""
    status = ctx.state.get("status", "idle")
    if status == "feedback":
        ctx.route = "evaluate"
    elif status == "complete":
        ctx.route = "complete"
    elif status == "idle" or not ctx.state.get("case"):
        ctx.route = "build"
    else:
        ctx.route = "question"
    return ""


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


def _build_evaluator() -> LlmAgent:
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


def _build_scorer() -> LlmAgent:
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


def build_workflow_agent() -> Workflow:
    """Graph-based oral-boards examiner with Workflow.

    Each request enters through a state router:

      idle → case_builder
      presenting/questioning → questioner
      feedback → evaluator → router → questioner/scorer

    Case building and question generation are terminal steps. The browser
    starts a new invocation after Begin Examination and after each answer.
    - The evaluator calls ``complete_examination`` when all relevant skillsets
      are covered, setting a state flag read by the router.
    """
    case_builder = build_case_builder()
    questioner = build_questioner()
    evaluator = _build_evaluator()
    scorer = _build_scorer()

    router = FunctionNode(
        func=questioning_router,
        name="questioning_router",
    )
    entry_router = FunctionNode(
        func=workflow_entry_router,
        name="workflow_entry_router",
    )

    return _WorkflowWithSubAgents(
        name="oralboards_workflow",
        description="Graph-based oral-boards examiner — workflow with conditional loop.",
        edges=[
            (START, entry_router),
            (
                entry_router,
                {
                    "build": case_builder,
                    "evaluate": evaluator,
                    "complete": scorer,
                    "__DEFAULT__": questioner,
                },
            ),
            (evaluator, router),
            (router, {"__DEFAULT__": questioner, "complete": scorer}),
        ],
    )
