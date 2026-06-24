from unittest.mock import Mock

import pytest
from agents_shared.dependencies import create_agent_services
from fastapi import FastAPI
from google.adk.agents import LlmAgent
from trends_agent import agent, main


def test_build_agent_returns_llm_agent() -> None:
    a = agent.build_agent()
    assert isinstance(a, LlmAgent)
    assert a.name == "GoogleTrendsAgent"


def test_agent_has_all_tools() -> None:
    a = agent.build_agent()
    tool_names = {
        tool.name if hasattr(tool, "name") else getattr(tool, "__name__", "")
        for tool in a.tools
    }
    assert {
        "validate_trends_sql",
        "begin_trends_query",
        "execute_bigquery_sql",
        "write_trends_result",
        "set_trends_verification",
        "generate_a2ui",
    } <= tool_names


def test_instruction_describes_web_verification() -> None:
    instruction = agent._INSTRUCTION
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


def test_instruction_persists_state_before_rendering() -> None:
    instruction = agent._INSTRUCTION
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
        "copilotkit://trends/v1"
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