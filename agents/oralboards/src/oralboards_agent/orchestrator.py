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
from google.adk.events.event_actions import EventActions
from google.adk.utils.context_utils import Aclosing

from .phases import (
    build_case_builder,
    build_evaluator,
    build_questioner,
    build_scorer,
)
from .question_craft import question_craft_violations


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

    After the evaluator runs (and the invocation wasn't paused), the next
    step is decided from state, in priority order:

    1. ``interview_complete`` is set → chain into the scorer.
    2. Otherwise, if ``status`` is now ``"questioning"`` (``append_exchange``
       fired — the evaluator scored the exchange) → chain into the
       questioner, so feedback and the next question land in the same AG-UI
       turn.
    3. Otherwise (``status`` is still ``"feedback"`` — the evaluator called
       ``ask_probe`` instead of ``append_exchange``) → chain into nothing.
       The next invocation's ``route_phase`` sees ``status == "feedback"``
       and routes back to the evaluator for the probe follow-up.
    """

    def _state_delta_event(self, ctx: InvocationContext, feedback: str) -> Event:
        """Orchestrator-authored event persisting question_craft_feedback."""
        return Event(
            invocation_id=ctx.invocation_id,
            author=self.name,
            actions=EventActions(state_delta={"question_craft_feedback": feedback}),
        )

    async def _run_questioner_gated(
        self, ctx: InvocationContext, questioner: BaseAgent
    ) -> AsyncGenerator[Event]:
        """Run the questioner through the deterministic question-craft gate.

        If the drafted question violates question craft, write the violation
        list into ``question_craft_feedback`` (so the questioner's rewrite
        section sees it), re-run the questioner exactly ONCE, then clear the
        feedback so the next question's template doesn't see stale feedback.
        The second attempt is accepted regardless.
        """
        async with Aclosing(questioner.run_async(ctx)) as agen:
            async for event in agen:
                yield event

        question = str(ctx.session.state.get("current_question") or "")
        violations = question_craft_violations(question)
        if not violations:
            return

        feedback = "; ".join(violations)
        ctx.session.state["question_craft_feedback"] = feedback
        yield self._state_delta_event(ctx, feedback)

        async with Aclosing(questioner.run_async(ctx)) as agen:
            async for event in agen:
                yield event

        ctx.session.state["question_craft_feedback"] = ""
        yield self._state_delta_event(ctx, "")

    def _node_stream(
        self, ctx: InvocationContext, node: BaseAgent
    ) -> AsyncGenerator[Event]:
        """Node event stream; the questioner runs behind the craft gate."""
        if node.name == "questioner":
            return self._run_questioner_gated(ctx, node)
        return node.run_async(ctx)

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event]:
        nodes = {agent.name: agent for agent in self.sub_agents}
        node = nodes[route_phase(ctx.session.state)]

        paused = False
        async with Aclosing(self._node_stream(ctx, node)) as agen:
            async for event in agen:
                yield event
                if ctx.should_pause_invocation(event):
                    paused = True
        if paused:
            return

        if node.name != "evaluator":
            return

        state = ctx.session.state
        if state.get("interview_complete"):
            next_node = nodes["scorer"]
        elif state.get("status") == "questioning":
            next_node = nodes["questioner"]
        else:
            return

        async with Aclosing(self._node_stream(ctx, next_node)) as agen:
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
