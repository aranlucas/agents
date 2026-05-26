from unittest.mock import AsyncMock, MagicMock


async def test_executor_creates_session_when_missing():
    """Executor creates an ADK session if context_id has no existing session."""
    from utils import ADKAgentExecutor

    runner = MagicMock()
    runner.app_name = "test_agent"
    runner.session_service = AsyncMock()
    runner.session_service.get_session = AsyncMock(return_value=None)
    runner.session_service.create_session = AsyncMock()

    async def fake_run(**kwargs):
        event = MagicMock()
        event.is_final_response.return_value = True
        event.content.parts = [MagicMock(text="Done")]
        yield event

    runner.run_async = fake_run

    context = MagicMock()
    context.current_task = None
    context.context_id = "ctx-abc"

    from a2a.helpers import new_text_message
    from a2a.types import Role
    context.message = new_text_message("hello", role=Role.ROLE_USER)

    queue = AsyncMock()
    queue.enqueue_event = AsyncMock()

    executor = ADKAgentExecutor(runner)
    await executor.execute(context, queue)

    runner.session_service.create_session.assert_called_once_with(
        app_name="test_agent",
        user_id="demo_user",
        session_id="ctx-abc",
    )


async def test_executor_skips_session_creation_when_exists():
    """Executor does not create a session if one already exists."""
    from utils import ADKAgentExecutor

    runner = MagicMock()
    runner.app_name = "test_agent"
    runner.session_service = AsyncMock()
    runner.session_service.get_session = AsyncMock(return_value=object())
    runner.session_service.create_session = AsyncMock()

    async def fake_run(**kwargs):
        event = MagicMock()
        event.is_final_response.return_value = True
        event.content.parts = [MagicMock(text="Result")]
        yield event

    runner.run_async = fake_run

    context = MagicMock()
    context.current_task = None
    context.context_id = "ctx-existing"

    from a2a.helpers import new_text_message
    from a2a.types import Role
    context.message = new_text_message("query", role=Role.ROLE_USER)

    queue = AsyncMock()
    queue.enqueue_event = AsyncMock()

    executor = ADKAgentExecutor(runner)
    await executor.execute(context, queue)

    runner.session_service.create_session.assert_not_called()


def test_agent_card_route():
    """A2A agent card is served at the well-known URL."""
    from fastapi.testclient import TestClient
    import sys
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    import main
    client = TestClient(main.app)
    r = client.get("/.well-known/agent-card.json")
    assert r.status_code == 200
    assert r.json()["name"] == "Fitness Training Agent"


def test_a2a_rpc_route_exists():
    """POST / returns an A2A error (not 404), proving the route is registered."""
    from fastapi.testclient import TestClient
    import sys
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    import main
    client = TestClient(main.app, raise_server_exceptions=False)
    r = client.post("/", json={})
    assert r.status_code != 404


def test_agui_moved_to_slash_agui():
    """AG-UI endpoint is at /agui, not /."""
    from fastapi.testclient import TestClient
    import sys
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    import main
    client = TestClient(main.app, raise_server_exceptions=False)
    r = client.post("/agui", content=b"")
    assert r.status_code != 404
