"""Import smoke test for every agent service module.

Importing an agent's `main` exercises module-load: it evaluates every function
annotation and runs the agent/FastAPI wiring at import time. This catches two
classes of bug that the linters do not:

  * runtime-evaluated annotations referencing names only imported under
    `if TYPE_CHECKING:` (ADK calls `get_type_hints` on tools) -> NameError
  * syntax errors Ruff's parser accepts but CPython rejects (e.g. the Python 2
    `except A, B:` form)

If an agent service cannot be imported, it cannot start — so this is the
minimum bar for "the service works".
"""

import importlib

import pytest
from google.adk.tools.agent_tool import AgentTool

AGENT_MODULES = [
    "a2ui_agent.main",
    "fitness_agent.main",
    "gateway.main",
    "grocery_agent.main",
    "oralboards_agent.main",
    "resume_agent.main",
    "travel_agent.main",
    "wellness_agent.main",
]


@pytest.mark.parametrize("module_name", AGENT_MODULES)
def test_agent_module_imports(module_name: str) -> None:
    importlib.import_module(module_name)


def test_wellness_uses_task_mode_sub_agents() -> None:
    from wellness_agent.agent import build_agent

    agent = build_agent()

    sub_agent_names = [sa.name for sa in agent.sub_agents]
    assert sub_agent_names == ["fitness_agent", "grocery_agent"]
    assert [sa.mode for sa in agent.sub_agents] == [
        "task",
        "task",
    ]
    assert not any(type(tool) is AgentTool for tool in agent.tools)
    assert {"fitness_agent", "grocery_agent"}.issubset(
        {tool.name for tool in agent.tools if hasattr(tool, "name")},
    )
