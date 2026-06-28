from telegram_bot.agent_registry import TELEGRAM_AGENT_IDS, TELEGRAM_SURFACED_AGENTS
from telegram_bot.orchestrator import ORCHESTRATOR_AGENT_ID, build_orchestrator_agent


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


def test_orchestrator_only_sets_task_mode_on_leaf_specialists() -> None:
    orchestrator = build_orchestrator_agent()

    modes = {
        agent.name: getattr(agent, "mode", None) for agent in orchestrator.sub_agents
    }
    assert modes["wellness_agent"] == "chat"
    assert modes["collab_trip_agent"] == "task"
    assert modes["grocery_agent"] == "task"
    assert modes["fitness_agent"] == "task"
