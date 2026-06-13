"""Shared prompt UX contracts for artifact-producing agents."""

import pytest
from a2ui_agent.agent import build_agent as build_a2ui_agent
from agents_shared.prompts import CANVAS_CONTRACT_MARKER
from fitness_agent.agent import build_agent as build_fitness_agent
from grocery_agent.agent import build_agent as build_grocery_agent
from oralboards_agent.agent import build_agent as build_oralboards_agent
from travel_agent.agent import build_agent as build_travel_agent
from wellness_agent.agent import build_agent as build_wellness_agent

ARTIFACT_AGENT_BUILDERS = [
    build_travel_agent,
    build_grocery_agent,
    build_fitness_agent,
    build_wellness_agent,
    build_oralboards_agent,
    build_a2ui_agent,
]


@pytest.mark.parametrize("build_agent", ARTIFACT_AGENT_BUILDERS)
def test_artifact_agents_include_shared_canvas_contract(build_agent) -> None:
    static_instruction = build_agent().static_instruction

    assert isinstance(static_instruction, str)
    assert CANVAS_CONTRACT_MARKER in static_instruction
    assert "Never paste the full" in static_instruction
    assert "1-2 sentences" in static_instruction
    assert "one concrete next step" in static_instruction
