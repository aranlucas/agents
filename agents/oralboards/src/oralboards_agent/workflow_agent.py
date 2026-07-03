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

from google.adk import Workflow
from google.adk.tools import ToolContext
from google.adk.workflow import START, FunctionNode
from pydantic import ConfigDict, Field

from .phases import (
    _AGENT_DEFAULTS,  # noqa: F401 — re-exported for tests until Task 4  # type: ignore[reportPrivateUsage,reportUnusedImport]
    build_case_builder,
    build_questioner,
)
from .phases import (
    build_evaluator as _build_evaluator,
)
from .phases import (
    build_scorer as _build_scorer,
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
