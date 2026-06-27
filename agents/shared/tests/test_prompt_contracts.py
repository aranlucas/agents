"""Shared prompt UX contracts for artifact-producing agents."""

import pytest
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
]


@pytest.mark.parametrize("build_agent", ARTIFACT_AGENT_BUILDERS)
def test_artifact_agents_include_shared_canvas_contract(build_agent) -> None:
    instruction = build_agent().instruction

    assert isinstance(instruction, str)
    assert CANVAS_CONTRACT_MARKER in instruction
    assert "Never paste the full" in instruction
    assert "1-2 sentences" in instruction
    assert "one concrete next step" in instruction


def test_grocery_cart_mutation_requires_user_approval() -> None:
    instruction = build_grocery_agent().instruction

    assert isinstance(instruction, str)
    assert "request_user_approval" in instruction
    assert "Only call `add_to_cart` after approval" in instruction
    assert "Do not call `checkout_shopping_list`" in instruction
