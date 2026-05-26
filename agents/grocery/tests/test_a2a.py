import pytest
from unittest.mock import AsyncMock, MagicMock


@pytest.mark.asyncio
async def test_executor_creates_session_when_missing():
    """Executor creates an ADK session if context_id has no existing session."""
    from a2a_executor import ADKAgentExecutor

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
        user_id="a2a_user",
        session_id="ctx-abc",
    )


@pytest.mark.asyncio
async def test_executor_skips_session_creation_when_exists():
    """Executor does not create a session if one already exists."""
    from a2a_executor import ADKAgentExecutor

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
