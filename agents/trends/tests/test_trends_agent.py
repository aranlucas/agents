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


def test_build_agent_executor_has_bigquery_tool() -> None:
    a = agent.build_agent()
    executor = next(s for s in a.sub_agents if s.name == "TrendsQueryExecutorAgent")
    tool_names = [t.__name__ if callable(t) else str(t) for t in executor.tools]
    assert any("execute_bigquery_sql" in name for name in tool_names)


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
