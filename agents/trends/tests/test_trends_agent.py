from unittest.mock import Mock

import pytest
from agents_shared.dependencies import create_agent_services
from fastapi import FastAPI
from google.adk.agents import LlmAgent
from google.adk.tools.agent_tool import AgentTool
from trends_agent import agent, main
from trends_agent.sub_agents.generator import build_generator


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
        "TrendsQueryGeneratorAgent",
    } <= tool_names


def test_generator_is_agent_tool() -> None:
    a = agent.build_agent()
    gen_tools = [t for t in a.tools if isinstance(t, AgentTool)]
    assert len(gen_tools) == 1
    assert gen_tools[0].name == "TrendsQueryGeneratorAgent"


def test_build_generator_returns_llm_agent() -> None:
    g = build_generator()
    assert isinstance(g, LlmAgent)
    assert g.name == "TrendsQueryGeneratorAgent"
    assert g.output_key == "generated_sql"


def test_instruction_describes_web_verification() -> None:
    instruction = agent._INSTRUCTION
    assert "set_trends_verification" in instruction
    assert "Brave" in instruction
    assert "AT MOST 2" in instruction
    assert "CONFIRMED" in instruction
    assert "CONTRADICTED" in instruction
    assert "UNVERIFIED" in instruction
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
    assert instruction.index("TrendsQueryGeneratorAgent") < instruction.index(
        "validate_trends_sql"
    )
    assert instruction.index("validate_trends_sql") < instruction.index(
        "begin_trends_query"
    )
    assert instruction.index("begin_trends_query") < instruction.index(
        "execute_bigquery_sql"
    )
    assert instruction.index("write_trends_result") < instruction.index("generate_a2ui")
    assert "Never invent values" in instruction


def test_a2ui_composition_guide_uses_correct_prop_names() -> None:
    g = agent._TRENDS_A2UI_COMPOSITION_GUIDE
    # TrendBarChart must use the schema's exact prop names
    assert "categoryKey" in g
    assert "valueKey" in g
    # rows must be passed directly on the component, not via a separate data model
    assert "rows" in g
    assert "data" in g  # "data field" warning must be present
    # TrendTable must cap at 10 rows
    assert "10" in g
    assert "maxRows" in g
    # wrong names from the incident must not appear
    assert "value_column" not in g
    assert "label_column" not in g


def test_a2ui_tool_uses_composition_guide_not_generation_guidelines() -> None:
    # generation_guidelines REPLACES the default A2UI protocol instructions;
    # composition_guide APPENDS after them. Trends must use the latter so the
    # subagent still receives the render_a2ui contract and component-ID rules.
    a = agent.build_agent()
    a2ui_tools = [t for t in a.tools if getattr(t, "name", None) == "generate_a2ui"]
    assert len(a2ui_tools) == 1
    cfg = a2ui_tools[0]._cfg
    guidelines = cfg.get("guidelines") or {}
    assert "composition_guide" in guidelines
    assert "generation_guidelines" not in guidelines


def test_trends_catalog_id_is_stable() -> None:
    assert agent.TRENDS_CATALOG_ID == ("copilotkit://trends/v1")


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
