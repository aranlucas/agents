from unittest.mock import Mock

import pytest
from agents_shared.dependencies import create_agent_services
from fastapi import FastAPI
from google.adk.agents import SequentialAgent
from trends_agent import agent, main


def test_build_agent_returns_sequential_agent() -> None:
    a = agent.build_agent()
    assert isinstance(a, SequentialAgent)
    assert a.name == "GoogleTrendsAgent"
    assert len(a.sub_agents) == 2


def test_build_agent_sub_agent_names() -> None:
    a = agent.build_agent()
    names = [s.name for s in a.sub_agents]
    assert "TrendsQueryGeneratorAgent" in names
    assert "TrendsQueryExecutorAgent" in names


def test_executor_has_state_bigquery_and_explicit_a2ui_tools() -> None:
    trends = agent.build_agent()
    executor = next(
        child for child in trends.sub_agents
        if child.name == "TrendsQueryExecutorAgent"
    )
    tool_names = {
        tool.name if hasattr(tool, "name") else getattr(tool, "__name__", "")
        for tool in executor.tools
    }
    assert {
        "validate_trends_sql",
        "begin_trends_query",
        "execute_bigquery_sql",
        "write_trends_result",
        "set_trends_verification",
        "generate_a2ui",
    } <= tool_names


def test_executor_instruction_describes_web_verification() -> None:
    instruction = agent._EXECUTOR_INSTRUCTION
    assert "set_trends_verification" in instruction
    assert "Brave" in instruction
    assert "AT MOST 2" in instruction
    assert "CONFIRMED" in instruction
    assert "CONTRADICTED" in instruction
    assert "UNVERIFIED" in instruction
    # Verification is appended after the result is written.
    assert instruction.index("write_trends_result") < instruction.index(
        "set_trends_verification"
    )


@pytest.mark.asyncio
async def test_throttle_web_search_ignores_non_brave_tools() -> None:
    agent._web_search_state["last_at"] = 1000.0
    await agent.throttle_web_search(Mock(name="other_tool"), {}, Mock())
    assert agent._web_search_state["last_at"] == 1000.0


def test_executor_persists_state_before_rendering() -> None:
    instruction = agent._EXECUTOR_INSTRUCTION
    assert instruction.index("validate_trends_sql") < instruction.index(
        "begin_trends_query"
    )
    assert instruction.index("begin_trends_query") < instruction.index(
        "execute_bigquery_sql"
    )
    assert instruction.index("write_trends_result") < instruction.index(
        "generate_a2ui"
    )
    assert "Never invent values" in instruction


def test_trends_catalog_id_is_stable() -> None:
    assert agent.TRENDS_CATALOG_ID == (
        "https://agents-lucas.vercel.app/a2ui/catalogs/trends/v1"
    )


def _route_paths(app: FastAPI) -> set[str]:
    paths = set()
    for route in app.routes:
        if hasattr(route, "path"):
            paths.add(route.path)
        if hasattr(route, "original_router") and hasattr(route, "include_context"):
            prefix = getattr(route.include_context, "prefix", "") or ""
            for sub in route.original_router.routes:
                if hasattr(sub, "path"):
                    paths.add(prefix + sub.path)
    return paths


def test_register_exposes_health_and_agui_routes() -> None:
    app = FastAPI()
    main.register(app, create_agent_services())
    paths = _route_paths(app)
    assert "/trends/health" in paths
    assert any(p.startswith("/trends/agui") for p in paths)