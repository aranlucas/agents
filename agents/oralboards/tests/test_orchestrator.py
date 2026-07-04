"""Routing + delegation tests for the oral-boards BaseAgent orchestrator."""

from types import SimpleNamespace

import pytest
from google.adk.agents import BaseAgent
from oralboards_agent.orchestrator import (
    OralBoardsOrchestrator,
    build_orchestrator_agent,
    route_phase,
)


@pytest.mark.parametrize(
    ("state", "expected"),
    [
        ({}, "case_builder"),
        ({"status": "idle"}, "case_builder"),
        ({"status": "questioning"}, "case_builder"),  # no case yet
        ({"status": "presenting", "case": "c"}, "questioner"),
        ({"status": "questioning", "case": "c"}, "questioner"),
        ({"status": "feedback", "case": "c"}, "evaluator"),
        ({"status": "complete", "case": "c"}, "scorer"),
        ({"status": "garbage", "case": "c"}, "questioner"),  # default edge
    ],
)
def test_route_phase(state: dict, expected: str) -> None:
    assert route_phase(state) == expected


class _StubPhase(BaseAgent):
    """Bypasses BaseAgent.run_async plumbing so units test only delegation."""

    async def run_async(self, ctx):  # noqa: ANN001 — SimpleNamespace in tests
        ctx.calls.append(self.name)
        yield SimpleNamespace(author=self.name)


class _CompletingEvaluator(BaseAgent):
    async def run_async(self, ctx):  # noqa: ANN001
        ctx.calls.append(self.name)
        ctx.session.state["interview_complete"] = True
        yield SimpleNamespace(author=self.name)


class _ExchangingEvaluator(BaseAgent):
    """Mimics append_exchange: scores the answer and advances to questioning."""

    async def run_async(self, ctx):  # noqa: ANN001
        ctx.calls.append(self.name)
        ctx.session.state["status"] = "questioning"
        yield SimpleNamespace(author=self.name)


class _FinalExchangeEvaluator(BaseAgent):
    """Mimics the final exchange: append_exchange AND complete_examination both
    fire in the same turn, so status="questioning" and interview_complete=True
    are set together. Scorer must still win over questioner."""

    async def run_async(self, ctx):  # noqa: ANN001
        ctx.calls.append(self.name)
        ctx.session.state["status"] = "questioning"
        ctx.session.state["interview_complete"] = True
        yield SimpleNamespace(author=self.name)


def _ctx(state: dict) -> SimpleNamespace:
    return SimpleNamespace(
        session=SimpleNamespace(state=state),
        should_pause_invocation=lambda event: False,
        calls=[],
    )


def _orchestrator(evaluator: BaseAgent | None = None) -> OralBoardsOrchestrator:
    return OralBoardsOrchestrator(
        name="oralboards_agent",
        sub_agents=[
            _StubPhase(name="case_builder"),
            _StubPhase(name="questioner"),
            evaluator or _StubPhase(name="evaluator"),
            _StubPhase(name="scorer"),
        ],
    )


async def _drain(orch: OralBoardsOrchestrator, ctx: SimpleNamespace) -> list:
    return [event async for event in orch._run_async_impl(ctx)]


@pytest.mark.asyncio
async def test_runs_exactly_one_phase_per_invocation() -> None:
    ctx = _ctx({"status": "questioning", "case": "c"})
    await _drain(_orchestrator(), ctx)
    assert ctx.calls == ["questioner"]


@pytest.mark.asyncio
async def test_evaluator_chains_to_scorer_when_interview_complete() -> None:
    ctx = _ctx({"status": "feedback", "case": "c"})
    await _drain(_orchestrator(evaluator=_CompletingEvaluator(name="evaluator")), ctx)
    assert ctx.calls == ["evaluator", "scorer"]


@pytest.mark.asyncio
async def test_evaluator_without_completion_does_not_chain() -> None:
    """Probe case (Task 8): status stays "feedback" (ask_probe, not
    append_exchange), so nothing chains and the next invocation's
    route_phase routes back to the evaluator."""
    ctx = _ctx({"status": "feedback", "case": "c"})
    await _drain(_orchestrator(), ctx)
    assert ctx.calls == ["evaluator"]


@pytest.mark.asyncio
async def test_evaluator_chains_to_questioner_when_exchange_scored() -> None:
    ctx = _ctx({"status": "feedback", "case": "c"})
    await _drain(_orchestrator(evaluator=_ExchangingEvaluator(name="evaluator")), ctx)
    assert ctx.calls == ["evaluator", "questioner"]


@pytest.mark.asyncio
async def test_scorer_wins_over_questioner_on_final_exchange() -> None:
    """Both status="questioning" and interview_complete=True can be set in the
    same evaluator turn (final exchange). interview_complete must take
    priority so the exam ends on the scorer, not one more question."""
    ctx = _ctx({"status": "feedback", "case": "c"})
    await _drain(
        _orchestrator(evaluator=_FinalExchangeEvaluator(name="evaluator")), ctx
    )
    assert ctx.calls == ["evaluator", "scorer"]


def test_build_orchestrator_exposes_sub_agents_for_agui() -> None:
    orch = build_orchestrator_agent()
    assert orch.name == "oralboards_agent"
    assert [agent.name for agent in orch.sub_agents] == [
        "case_builder",
        "questioner",
        "evaluator",
        "scorer",
    ]


def test_phase_prompts_keep_state_driven_question_contract() -> None:
    from oralboards_agent.phases import build_case_builder, build_questioner

    case_builder = build_case_builder()
    questioner = build_questioner()

    assert "ask_question" not in case_builder.static_instruction
    assert "set_phase('presenting')" in case_builder.static_instruction
    assert "ask_question" not in questioner.static_instruction
    assert questioner.output_key == "current_question"
    assert questioner.tools == []


def test_phase_model_tiering() -> None:
    """Strongest model on the evaluator (pedagogically critical); cheap on mechanical phases."""
    from oralboards_agent.phases import (
        build_case_builder,
        build_evaluator,
        build_questioner,
        build_scorer,
    )

    assert build_evaluator().model.model == "mistral/mistral-large-latest"
    assert build_case_builder().model.model == "gemini-3.1-flash-lite"
    assert build_questioner().model.model == "groq/llama-3.3-70b-versatile"
    assert build_scorer().model.model == "mistral/mistral-medium-latest"


def test_evaluator_can_ground_beyond_case_passages() -> None:
    from oralboards_agent.phases import build_evaluator

    evaluator = build_evaluator()
    tool_names = {
        getattr(tool, "__name__", getattr(tool, "name", "")) for tool in evaluator.tools
    }
    assert "search_docs" in tool_names
    assert "Re-search" in evaluator.static_instruction


def test_evaluator_feedback_is_contrastive_and_cited() -> None:
    from oralboards_agent.phases import build_evaluator

    instruction = build_evaluator().static_instruction
    assert "What you said" in instruction
    assert "What was missing" in instruction
    assert "What a 3 sounds like" in instruction
    assert "quote" in instruction.lower()
