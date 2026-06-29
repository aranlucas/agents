from collections.abc import Iterable

from ag_ui_adk import AGUIToolset
from agents_shared.tools import strip_thinking_before_model
from excalidraw_agent.agent import build_telegram_agent as build_excalidraw
from expense_agent.agent import build_telegram_agent as build_expense
from fitness_agent.agent import build_telegram_agent as build_fitness
from grocery_agent.agent import build_telegram_agent as build_grocery
from oralboards_agent.agent import build_telegram_agent as build_oralboards
from presentation_agent.agent import build_telegram_agent as build_presentation
from research_agent.agent import build_telegram_agent as build_research
from resume_agent.agent import build_telegram_agent as build_resume
from spreadsheet_agent.agent import build_telegram_agent as build_spreadsheet
from telegram_bot.agent_registry import TELEGRAM_AGENT_IDS, TELEGRAM_SURFACED_AGENTS
from telegram_bot.orchestrator import (
    ORCHESTRATOR_AGENT_ID,
    TELEGRAM_ORCHESTRATOR_MODEL,
    build_orchestrator_agent,
)
from travel_agent.agent import build_telegram_agent as build_travel
from trends_agent.agent import build_agent as build_trends
from wellness_agent.agent import build_telegram_agent as build_wellness


def _agent_tree(agent: object) -> Iterable[object]:
    yield agent
    for child in getattr(agent, "sub_agents", []) or []:
        yield from _agent_tree(child)


def _agent_tools(agent: object) -> Iterable[object]:
    for node in _agent_tree(agent):
        yield from getattr(node, "tools", []) or []


def test_telegram_registry_matches_surfaced_agent_order() -> None:
    assert TELEGRAM_AGENT_IDS == (
        "orchestrator",
        "excalidraw",
        "travel",
        "grocery",
        "fitness",
        "wellness",
        "expense",
        "oral-boards",
        "oral-boards-v2",
        "trends",
        "resume",
        "research",
        "spreadsheet",
        "presentation",
    )


def test_surfaced_agent_registry_excludes_orchestrator() -> None:
    assert tuple(spec.id for spec in TELEGRAM_SURFACED_AGENTS) == TELEGRAM_AGENT_IDS[1:]


def test_orchestrator_wraps_base_agent_backed_specialists() -> None:
    orchestrator = build_orchestrator_agent()

    assert orchestrator.name == "telegram_orchestrator_agent"
    assert orchestrator.rerun_on_resume is True
    assert orchestrator.model.model == TELEGRAM_ORCHESTRATOR_MODEL
    assert orchestrator.before_model_callback is strip_thinking_before_model
    assert TELEGRAM_ORCHESTRATOR_MODEL == "mistral/mistral-medium-latest"
    assert len(orchestrator.sub_agents) == len(TELEGRAM_SURFACED_AGENTS) - 1
    assert {agent.name for agent in orchestrator.sub_agents} == {
        "excalidraw_agent",
        "collab_trip_agent",
        "grocery_agent",
        "fitness_agent",
        "wellness_agent",
        "expense_desk_agent",
        "oralboards_agent",
        "GoogleTrendsAgent",
        "resume_agent",
        "research_canvas_agent",
        "spreadsheet_agent",
        "presentation_agent",
    }
    assert TELEGRAM_AGENT_IDS[0] == ORCHESTRATOR_AGENT_ID


def test_telegram_agent_builders_own_agent_descriptions() -> None:
    agents = {
        "excalidraw": build_excalidraw(),
        "travel": build_travel(),
        "grocery": build_grocery(),
        "fitness": build_fitness(),
        "wellness": build_wellness(),
        "expense": build_expense(),
        "oral-boards": build_oralboards(),
        "trends": build_trends(),
        "resume": build_resume(),
        "research": build_research(),
        "spreadsheet": build_spreadsheet(),
        "presentation": build_presentation(),
    }

    assert agents["excalidraw"].description == "Collaborative whiteboard assistant."
    assert (
        agents["travel"].description
        == "Trip planning, itinerary drafting, and booking readiness."
    )
    assert (
        agents["grocery"].description
        == "Meal planning, pantry, shopping list, and cart support."
    )
    assert (
        agents["fitness"].description
        == "Training plans and Strava-backed activity context."
    )
    assert (
        agents["wellness"].description
        == "In-process grocery and fitness orchestration."
    )
    assert agents["expense"].description == "Expense review and approval-desk workflow."
    assert (
        agents["oral-boards"].description == "Pediatric dentistry oral-board practice."
    )
    assert (
        agents["trends"].description
        == "Google Trends BigQuery analysis and verification."
    )
    assert agents["resume"].description == "Public resume Q&A."
    assert (
        agents["research"].description
        == "Research canvas, sources, sections, and reports."
    )
    assert (
        agents["spreadsheet"].description
        == "Spreadsheet creation, editing, and summaries."
    )
    assert (
        agents["presentation"].description
        == "Presentation outline and slide authoring."
    )


def test_orchestrator_builds_children_independently_from_registry(monkeypatch) -> None:
    import telegram_bot.agent_registry as registry

    monkeypatch.setattr(registry, "TELEGRAM_SURFACED_AGENTS", ())

    orchestrator = build_orchestrator_agent()

    assert {agent.name for agent in orchestrator.sub_agents} == {
        "excalidraw_agent",
        "collab_trip_agent",
        "grocery_agent",
        "fitness_agent",
        "wellness_agent",
        "expense_desk_agent",
        "oralboards_agent",
        "GoogleTrendsAgent",
        "resume_agent",
        "research_canvas_agent",
        "spreadsheet_agent",
        "presentation_agent",
    }


def test_orchestrator_only_sets_task_mode_on_leaf_specialists() -> None:
    orchestrator = build_orchestrator_agent()

    modes = {
        agent.name: getattr(agent, "mode", None) for agent in orchestrator.sub_agents
    }
    assert modes["wellness_agent"] == "chat"
    assert modes["collab_trip_agent"] == "task"
    assert modes["grocery_agent"] == "task"
    assert modes["fitness_agent"] == "task"


def test_telegram_surfaced_agents_do_not_expose_agui_toolsets() -> None:
    for spec in TELEGRAM_SURFACED_AGENTS:
        agent = spec.build()

        assert not any(isinstance(tool, AGUIToolset) for tool in _agent_tools(agent)), (
            spec.id
        )


def test_telegram_agents_with_subagents_rerun_on_resume() -> None:
    orchestrator = build_orchestrator_agent()

    for agent in _agent_tree(orchestrator):
        if getattr(agent, "sub_agents", None):
            assert getattr(agent, "rerun_on_resume", None) is True, agent.name


def test_telegram_resume_agent_uses_paid_mistral_model() -> None:
    agent = build_resume()

    assert agent.model.model == "mistral/mistral-medium-latest"


def test_telegram_oralboards_agent_uses_flash_lite_to_accept_reasoning_history() -> (
    None
):
    agent = build_oralboards()

    assert agent.model.model == "gemini-3.1-flash-lite"


def test_telegram_wellness_path_avoids_groq_models() -> None:
    agent = build_wellness()
    models = {
        node.name: node.model.model
        for node in _agent_tree(agent)
        if hasattr(node, "model")
    }

    assert models["wellness_agent"] == "mistral/mistral-medium-latest"
    assert models["fitness_agent"] == "mistral/mistral-medium-latest"
