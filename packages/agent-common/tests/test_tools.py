from types import SimpleNamespace

import pytest

from agent_common.tools import shared_after_tool_callback


@pytest.mark.asyncio
async def test_shared_after_tool_callback_returns_transfer_status_without_state_write():
    tool = SimpleNamespace(name="transfer_to_agent")
    tool_context = SimpleNamespace(state={})

    response = await shared_after_tool_callback(
        tool,
        {"agent_name": "fitness_remote_agent"},
        tool_context,
        {"result": None},
    )

    assert response == {
        "result": {
            "status": "transferring",
            "agent_name": "fitness_remote_agent",
        }
    }
    assert tool_context.state == {}
