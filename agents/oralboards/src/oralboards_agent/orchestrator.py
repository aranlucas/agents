"""Deterministic phase orchestrator for the oral-boards examiner.

Custom BaseAgent instead of ADK Workflow: ag-ui-adk's per-run agent-tree copy
and AGUIToolset replacement traverse ``sub_agents`` only (ag-ui #2036, closed
NOT_PLANNED), so a Workflow graph needs a private-API shim. A BaseAgent with
real ``sub_agents`` is the shape both libraries support natively.
"""

from collections.abc import AsyncGenerator, Mapping
from typing import Any

from google.adk.agents import BaseAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events.event import Event
from google.adk.utils.context_utils import Aclosing

from .phases import (
    build_case_builder,
    build_evaluator,
    build_questioner,
    build_scorer,
)


def route_phase(state: Mapping[str, Any]) -> str:
    """Pick the phase for this invocation from persisted exam state."""
    status = state.get("status", "idle")
    if status == "feedback":
        return "evaluator"
    if status == "complete":
        return "scorer"
    if status == "idle" or not state.get("case"):
        return "case_builder"
    return "questioner"


class OralBoardsOrchestrator(BaseAgent):
    """Runs exactly one phase per invocation, chosen by ``route_phase``.

    The evaluator chains into the scorer in the same turn when it has called
    ``complete_examination`` (which sets ``interview_complete``).
    """

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event]:
        nodes = {agent.name: agent for agent in self.sub_agents}
        node = nodes[route_phase(ctx.session.state)]

        paused = False
        async with Aclosing(node.run_async(ctx)) as agen:
            async for event in agen:
                yield event
                if ctx.should_pause_invocation(event):
                    paused = True
        if paused:
            return

        if node.name == "evaluator" and ctx.session.state.get("interview_complete"):
            async with Aclosing(nodes["scorer"].run_async(ctx)) as agen:
                async for event in agen:
                    yield event


def build_orchestrator_agent() -> OralBoardsOrchestrator:
    """Fresh orchestrator with the four phase sub-agents."""
    return OralBoardsOrchestrator(
        name="oralboards_agent",
        description="Pediatric dentistry oral-board practice (phase-routed).",
        sub_agents=[
            build_case_builder(),
            build_questioner(),
            build_evaluator(),
            build_scorer(),
        ],
    )
