from collections.abc import AsyncIterator, Awaitable, Callable
from unittest.mock import Mock, create_autospec
from urllib.parse import parse_qs, urlparse

import pytest
from agents_shared.dependencies import AgentServices
from agents_shared.telegram_auth import consume_link_token, create_link_token
from google.adk.agents import LlmAgent
from pytest_mock import MockerFixture
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from telegram_bot.runner import (
    ORCHESTRATOR_COMPACTION_EVENT_RETENTION_SIZE,
    ORCHESTRATOR_COMPACTION_INTERVAL,
    ORCHESTRATOR_COMPACTION_OVERLAP_SIZE,
    ORCHESTRATOR_COMPACTION_TOKEN_THRESHOLD,
    TELEGRAM_MESSAGE_LIMIT,
    TelegramMessage,
    TelegramRunner,
    TelegramSentMessage,
    build_telegram_runner,
    chunk_text,
    format_state_summary,
    parse_allowed_chat_ids,
)

CredentialLoader = Callable[[str], Awaitable[tuple[dict[str, object], tuple[str, ...]]]]


class FakeReplyTarget:
    """Implements the ``TelegramReplyTarget`` protocol for the runner."""

    def __init__(self, chat_id: int) -> None:
        self.chat_id = chat_id
        self.messages: list[tuple[int, str]] = []
        self.disable_web_page_preview_values: list[bool] = []
        self.reply_markups: list[object] = []
        self.parse_modes: list[str | None] = []

    async def reply_text(
        self,
        text: str,
        *,
        disable_web_page_preview: bool = True,
        reply_markup: object = None,
        parse_mode: str | None = None,
    ) -> TelegramSentMessage:
        self.messages.append((self.chat_id, text))
        self.disable_web_page_preview_values.append(disable_web_page_preview)
        self.reply_markups.append(reply_markup)
        self.parse_modes.append(parse_mode)
        return FakeSentMessage(self)


class FakeSentMessage:
    def __init__(self, target: FakeReplyTarget) -> None:
        self.target = target

    async def edit_text(
        self,
        text: str,
        *,
        disable_web_page_preview: bool = True,
        parse_mode: str | None = None,
    ) -> object:
        self.target.messages.append((self.target.chat_id, text))
        self.target.disable_web_page_preview_values.append(disable_web_page_preview)
        self.target.parse_modes.append(parse_mode)
        return self


@pytest.fixture
async def engine(tmp_path) -> AsyncIterator[AsyncEngine]:
    db_path = tmp_path / "telegram_runner.sqlite"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest.fixture
def services(engine: AsyncEngine) -> AgentServices:
    """Typed mock of :class:`AgentServices` — only ``engine`` is real."""
    mock = create_autospec(AgentServices, instance=True)
    mock.engine = engine
    return mock


@pytest.fixture(autouse=True)
def no_live_clerk_lookup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CLERK_SECRET_KEY", raising=False)


@pytest.fixture
def orchestrator_agent(mocker: MockerFixture) -> Mock:
    """Patch ``build_orchestrator_agent`` so tests don't construct the real LiteLLM agent."""
    return mocker.patch(
        "telegram_bot.runner.build_orchestrator_agent",
        return_value=create_autospec(LlmAgent, instance=True),
    )


def _message(text: str, reply_target: FakeReplyTarget) -> TelegramMessage:
    return TelegramMessage(
        chat_id=reply_target.chat_id,
        user_id=456,
        text=text,
        message_id=99,
        chat_type="private",
        reply_target=reply_target,
    )


def _update(chat_id: int, text: str, reply_target: FakeReplyTarget):
    """Build a minimal ``Update`` carrying one text message."""
    from types import SimpleNamespace

    return SimpleNamespace(
        effective_message=SimpleNamespace(
            text=text, message_id=99, reply_text=reply_target.reply_text
        ),
        effective_chat=SimpleNamespace(id=chat_id, type="private"),
        effective_user=SimpleNamespace(id=456),
    )


def _build(
    services: AgentServices,
    *,
    link_base_url: str | None = None,
    connect_url: str | None = None,
    credential_loader: CredentialLoader | None = None,
    mini_app_url: str | None = None,
    status_update_seconds: float = 12.0,
    run_timeout_seconds: float = 180.0,
) -> TelegramRunner:
    """Build a runner via the public factory."""
    return build_telegram_runner(
        token="test-token-placeholder",  # noqa: S106
        services=services,
        link_base_url=link_base_url,
        connect_url=connect_url,
        credential_loader=credential_loader,
        mini_app_url=mini_app_url,
        status_update_seconds=status_update_seconds,
        run_timeout_seconds=run_timeout_seconds,
    )


def test_build_telegram_runner_registers_commands_and_text_handler(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    runner = _build(services)

    handler_types = {
        type(handler).__name__
        for group_handlers in runner.application.handlers.values()
        for handler in group_handlers
    }
    assert "CommandHandler" in handler_types
    assert "MessageHandler" in handler_types


def test_build_telegram_runner_registers_new_and_reset_commands(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    runner = _build(services)

    registered_commands: list[str] = []
    for group_handlers in runner.application.handlers.values():
        for handler in group_handlers:
            commands = getattr(handler, "commands", None)
            if commands is not None:
                registered_commands.extend(commands)

    assert "new" in registered_commands
    assert "reset" in registered_commands


def test_build_telegram_runner_enables_orchestrator_compaction(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    runner = _build(services)

    config = runner.runner.app.events_compaction_config

    assert config is not None
    assert config.compaction_interval == ORCHESTRATOR_COMPACTION_INTERVAL
    assert config.overlap_size == ORCHESTRATOR_COMPACTION_OVERLAP_SIZE
    assert config.token_threshold == ORCHESTRATOR_COMPACTION_TOKEN_THRESHOLD
    assert config.event_retention_size == ORCHESTRATOR_COMPACTION_EVENT_RETENTION_SIZE


def test_chunk_text_respects_telegram_message_limit() -> None:
    chunks = chunk_text("a" * (TELEGRAM_MESSAGE_LIMIT + 10))

    assert len(chunks) == 2
    assert all(len(chunk) <= TELEGRAM_MESSAGE_LIMIT for chunk in chunks)


def test_format_state_summary_hides_internal_state() -> None:
    summary = format_state_summary(
        {
            "user_id": "telegram:1",
            "temp:tool_response:write_itinerary": "hidden",
            "destination": "Lisbon",
            "itinerary": "Day 1\n\nDay 2",
        },
    )

    assert "Orchestrator updated state:" in summary
    assert "destination: Lisbon" in summary
    assert "itinerary: Day 1\nDay 2" in summary
    assert "telegram:1" not in summary
    assert "hidden" not in summary


def test_parse_allowed_chat_ids() -> None:
    assert parse_allowed_chat_ids("123, -456,789") == {123, -456, 789}
    assert parse_allowed_chat_ids(None) == set()


@pytest.mark.asyncio
async def test_handle_message_runs_agent_and_replies(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    """End-to-end: linked user + connected creds + mocked ADK Runner that returns text."""
    from google.genai import types

    token = await create_link_token(
        services.engine,
        telegram_user_id="456",
        telegram_chat_id="123",
    )
    assert (
        await consume_link_token(
            services.engine, token=token, clerk_user_id="clerk-user"
        )
        is not None
    )
    reply_target = FakeReplyTarget(chat_id=123)

    async def credential_state_loader(
        clerk_user_id: str,
    ) -> tuple[dict[str, object], tuple[str, ...]]:
        return {"user_id": clerk_user_id}, ()

    runner = _build(services, credential_loader=credential_state_loader)

    async def fake_run_async(*, user_id, session_id, new_message, state_delta):
        yield _Event(
            content=types.Content(
                role="model",
                parts=[types.Part(text="Here is the plan.")],
            )
        )

    runner.runner.run_async = fake_run_async  # type: ignore[method-assign]

    await runner.handle_message(_message("plan food", reply_target))

    assert reply_target.messages[1] == (123, "Here is the plan.")


@pytest.mark.asyncio
async def test_handle_message_sends_agent_text_without_markdown_parse_mode(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    """Telegram MarkdownV2 rejects raw agent punctuation such as exclamation marks."""
    from google.genai import types

    token = await create_link_token(
        services.engine,
        telegram_user_id="456",
        telegram_chat_id="123",
    )
    assert (
        await consume_link_token(
            services.engine, token=token, clerk_user_id="clerk-user"
        )
        is not None
    )
    reply_target = FakeReplyTarget(chat_id=123)

    async def credential_state_loader(
        clerk_user_id: str,
    ) -> tuple[dict[str, object], tuple[str, ...]]:
        return {"user_id": clerk_user_id}, ()

    runner = _build(services, credential_loader=credential_state_loader)

    async def fake_run_async(*, user_id, session_id, new_message, state_delta):
        yield _Event(
            content=types.Content(
                role="model",
                parts=[types.Part(text="Done! Use A+B = C.")],
            )
        )

    runner.runner.run_async = fake_run_async  # type: ignore[method-assign]

    await runner.handle_message(_message("plan food", reply_target))

    assert reply_target.messages[1] == (123, "Done! Use A+B = C.")
    assert reply_target.parse_modes[1] is None


@pytest.mark.asyncio
async def test_handle_message_sends_deduped_text(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    """Deduplicates identical final-response chunks."""
    from google.genai import types

    token = await create_link_token(
        services.engine,
        telegram_user_id="456",
        telegram_chat_id="123",
    )
    assert (
        await consume_link_token(
            services.engine, token=token, clerk_user_id="clerk-user"
        )
        is not None
    )
    reply_target = FakeReplyTarget(chat_id=123)

    async def credential_state_loader(
        clerk_user_id: str,
    ) -> tuple[dict[str, object], tuple[str, ...]]:
        return {"user_id": clerk_user_id}, ()

    runner = _build(services, credential_loader=credential_state_loader)

    async def fake_run_async(*, user_id, session_id, new_message, state_delta):
        yield _Event(
            content=types.Content(
                role="model",
                parts=[types.Part(text="same"), types.Part(text="same")],
            )
        )

    runner.runner.run_async = fake_run_async  # type: ignore[method-assign]

    await runner.handle_message(_message("hi", reply_target))

    assert (123, "same") in reply_target.messages


@pytest.mark.asyncio
async def test_handle_message_reports_runner_errors(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    """A RuntimeError from the ADK Runner is surfaced to the user."""
    from google.genai import types

    token = await create_link_token(
        services.engine,
        telegram_user_id="456",
        telegram_chat_id="123",
    )
    assert (
        await consume_link_token(
            services.engine, token=token, clerk_user_id="clerk-user"
        )
        is not None
    )
    reply_target = FakeReplyTarget(chat_id=123)

    async def credential_state_loader(
        clerk_user_id: str,
    ) -> tuple[dict[str, object], tuple[str, ...]]:
        return {"user_id": clerk_user_id}, ()

    runner = _build(services, credential_loader=credential_state_loader)

    async def fake_run_async(*, user_id, session_id, new_message, state_delta):
        yield _Event(
            content=types.Content(role="model", parts=[]),
            error_message="boom",
        )

    runner.runner.run_async = fake_run_async  # type: ignore[method-assign]

    await runner.handle_message(_message("hi", reply_target))

    assert any("hit an error: boom" in text for _, text in reply_target.messages)


@pytest.mark.asyncio
async def test_handle_message_updates_thinking_while_agent_runs(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    """Long-running subagent execution should visibly advance past Thinking."""
    import asyncio

    from google.genai import types

    token = await create_link_token(
        services.engine,
        telegram_user_id="456",
        telegram_chat_id="123",
    )
    assert (
        await consume_link_token(
            services.engine, token=token, clerk_user_id="clerk-user"
        )
        is not None
    )
    reply_target = FakeReplyTarget(chat_id=123)

    async def credential_state_loader(
        clerk_user_id: str,
    ) -> tuple[dict[str, object], tuple[str, ...]]:
        return {"user_id": clerk_user_id}, ()

    runner = _build(
        services,
        credential_loader=credential_state_loader,
        status_update_seconds=0.01,
    )

    async def fake_run_async(*, user_id, session_id, new_message, state_delta):
        await asyncio.sleep(0.03)
        yield _Event(
            content=types.Content(
                role="model",
                parts=[types.Part(text="Finished.")],
            )
        )

    runner.runner.run_async = fake_run_async  # type: ignore[method-assign]

    await runner.handle_message(_message("plan food", reply_target))

    assert (123, "Still working...") in reply_target.messages
    assert reply_target.messages[-1] == (123, "Finished.")


@pytest.mark.asyncio
async def test_handle_message_updates_thinking_with_tool_progress(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    """Tool-call events should update the placeholder with concrete progress."""
    import asyncio

    from google.genai import types

    token = await create_link_token(
        services.engine,
        telegram_user_id="456",
        telegram_chat_id="123",
    )
    assert (
        await consume_link_token(
            services.engine, token=token, clerk_user_id="clerk-user"
        )
        is not None
    )
    reply_target = FakeReplyTarget(chat_id=123)

    async def credential_state_loader(
        clerk_user_id: str,
    ) -> tuple[dict[str, object], tuple[str, ...]]:
        return {"user_id": clerk_user_id}, ()

    runner = _build(
        services,
        credential_loader=credential_state_loader,
        status_update_seconds=0.01,
    )

    async def fake_run_async(*, user_id, session_id, new_message, state_delta):
        yield _Event(
            content=types.Content(
                role="model",
                parts=[
                    types.Part(
                        function_call=types.FunctionCall(
                            name="fetch_activities",
                            args={},
                        )
                    )
                ],
            ),
            final=False,
        )
        await asyncio.sleep(0.02)
        yield _Event(
            content=types.Content(
                role="user",
                parts=[
                    types.Part(
                        function_response=types.FunctionResponse(
                            name="fetch_activities",
                            response={"ok": True},
                        )
                    )
                ],
            ),
            final=False,
        )
        yield _Event(
            content=types.Content(
                role="model",
                parts=[types.Part(text="Finished.")],
            )
        )

    runner.runner.run_async = fake_run_async  # type: ignore[method-assign]

    await runner.handle_message(_message("sync my run", reply_target))

    assert (123, "Running fetch activities...") in reply_target.messages
    assert (123, "Still running fetch activities...") in reply_target.messages
    assert (123, "Finished fetch activities.") in reply_target.messages
    assert reply_target.messages[-1] == (123, "Finished.")


@pytest.mark.asyncio
async def test_handle_message_emits_subagent_text_as_messages(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    """Sub-agent text events should be sent as their own Telegram messages."""
    from google.genai import types

    token = await create_link_token(
        services.engine,
        telegram_user_id="456",
        telegram_chat_id="123",
    )
    assert (
        await consume_link_token(
            services.engine, token=token, clerk_user_id="clerk-user"
        )
        is not None
    )
    reply_target = FakeReplyTarget(chat_id=123)

    async def credential_state_loader(
        clerk_user_id: str,
    ) -> tuple[dict[str, object], tuple[str, ...]]:
        return {"user_id": clerk_user_id}, ()

    runner = _build(services, credential_loader=credential_state_loader)

    async def fake_run_async(*, user_id, session_id, new_message, state_delta):
        yield _Event(
            author="grocery_agent",
            content=types.Content(
                role="model",
                parts=[types.Part(text="I drafted meals for the week.")],
            ),
        )
        yield _Event(
            author="fitness_agent",
            content=types.Content(
                role="model",
                parts=[types.Part(text="I added three easy runs.")],
            ),
        )
        yield _Event(
            author="telegram_orchestrator_agent",
            content=types.Content(
                role="model",
                parts=[types.Part(text="Your wellness plan is ready.")],
            ),
        )

    runner.runner.run_async = fake_run_async  # type: ignore[method-assign]

    await runner.handle_message(_message("make a wellness plan", reply_target))

    assert (
        123,
        "Grocery agent:\nI drafted meals for the week.",
    ) in reply_target.messages
    assert (
        123,
        "Fitness agent:\nI added three easy runs.",
    ) in reply_target.messages
    assert reply_target.messages[-1] == (123, "Your wellness plan is ready.")


@pytest.mark.asyncio
async def test_handle_message_times_out_stalled_agent_run(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    """A stalled ADK stream should replace the thinking message with guidance."""
    import asyncio

    token = await create_link_token(
        services.engine,
        telegram_user_id="456",
        telegram_chat_id="123",
    )
    assert (
        await consume_link_token(
            services.engine, token=token, clerk_user_id="clerk-user"
        )
        is not None
    )
    reply_target = FakeReplyTarget(chat_id=123)

    async def credential_state_loader(
        clerk_user_id: str,
    ) -> tuple[dict[str, object], tuple[str, ...]]:
        return {"user_id": clerk_user_id}, ()

    runner = _build(
        services,
        credential_loader=credential_state_loader,
        status_update_seconds=0.01,
        run_timeout_seconds=0.02,
    )

    async def fake_run_async(*, user_id, session_id, new_message, state_delta):
        await asyncio.sleep(1)
        if False:
            yield None

    runner.runner.run_async = fake_run_async  # type: ignore[method-assign]

    await runner.handle_message(_message("plan food", reply_target))

    assert any("took too long" in text for _, text in reply_target.messages)


def _Event(
    *,
    content,
    error_message: str | None = None,
    final: bool = True,
    author: str = "telegram_orchestrator_agent",
):
    """Build a minimal ADK Event for the handle_message loop."""
    actions = type("Actions", (), {"state_delta": None})()
    return type(
        "Event",
        (),
        {
            "actions": actions,
            "author": author,
            "content": content,
            "error_message": error_message,
            "is_final_response": lambda self: final,
        },
    )()


@pytest.mark.asyncio
async def test_help_command_sends_webapp_button_when_url_set(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    runner = _build(services, mini_app_url="https://example.com/tma")
    reply_target = FakeReplyTarget(chat_id=123)
    message = _message("/start", reply_target)

    await runner.send_help(message)

    assert len(reply_target.reply_markups) == 1
    assert reply_target.reply_markups[0] is not None


@pytest.mark.asyncio
async def test_help_command_no_webapp_button_when_no_url(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    runner = _build(services)
    reply_target = FakeReplyTarget(chat_id=123)
    message = _message("/start", reply_target)

    await runner.send_help(message)

    assert len(reply_target.reply_markups) == 1
    assert reply_target.reply_markups[0] is None


@pytest.mark.asyncio
async def test_login_command_sends_one_time_link(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    runner = _build(
        services,
        link_base_url="https://agents.example.com/telegram/link",
    )
    reply_target = FakeReplyTarget(chat_id=123)

    await runner.send_login_link(_message("/login", reply_target))

    assert len(reply_target.messages) == 1
    chat_id, text = reply_target.messages[0]
    assert chat_id == 123
    assert "https://agents.example.com/telegram/link?token=" in text
    token = parse_qs(urlparse(text.splitlines()[-1]).query)["token"][0]
    link = await consume_link_token(
        services.engine,
        token=token,
        clerk_user_id="clerk-user",
    )
    assert link is not None
    assert link.telegram_user_id == "456"


@pytest.mark.asyncio
async def test_unlinked_message_requires_login(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    runner = _build(services)
    reply_target = FakeReplyTarget(chat_id=123)

    await runner.handle_message(_message("plan food", reply_target))

    assert reply_target.messages == [
        (
            123,
            "Sign in is required. Send /login to link this Telegram account.",
        )
    ]


@pytest.mark.asyncio
async def test_missing_connected_accounts_still_runs_agent(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    """Missing credentials no longer block the bot — the agent runs and credential-gated
    tools simply return no tools to the LLM for that turn."""
    from google.genai import types

    token = await create_link_token(
        services.engine,
        telegram_user_id="456",
        telegram_chat_id="123",
    )
    assert (
        await consume_link_token(
            services.engine, token=token, clerk_user_id="clerk-user"
        )
        is not None
    )
    reply_target = FakeReplyTarget(chat_id=123)

    async def credential_state_loader(
        clerk_user_id: str,
    ) -> tuple[dict[str, object], tuple[str, ...]]:
        assert clerk_user_id == "clerk-user"
        return {
            "user_id": clerk_user_id,
            "kroger_connected": False,
            "strava_connected": False,
        }, (
            "Strava",
            "Kroger/QFC",
        )

    runner = _build(
        services,
        connect_url="https://agents.example.com/console/settings",
        credential_loader=credential_state_loader,
    )

    async def fake_run_async(*, user_id, session_id, new_message, state_delta):
        yield _Event(
            content=types.Content(
                role="model",
                parts=[types.Part(text="I can help with that.")],
            )
        )

    runner.runner.run_async = fake_run_async  # type: ignore[method-assign]

    await runner.handle_message(_message("plan food", reply_target))

    # Agent ran and replied — no credential gate block
    assert any("I can help with that." in text for _, text in reply_target.messages)


@pytest.mark.asyncio
async def test_reset_session_clears_session_for_linked_user(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    token = await create_link_token(
        services.engine,
        telegram_user_id="456",
        telegram_chat_id="123",
    )
    assert (
        await consume_link_token(
            services.engine, token=token, clerk_user_id="clerk-user"
        )
        is not None
    )
    reply_target = FakeReplyTarget(chat_id=123)
    runner = _build(services)

    await runner._reset_session(_message("/reset", reply_target))  # type: ignore[attr-defined]

    assert reply_target.messages == [(123, "Reset Orchestrator for this chat.")]


@pytest.mark.asyncio
async def test_reset_session_requires_login(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    reply_target = FakeReplyTarget(chat_id=123)
    runner = _build(services)

    await runner._reset_session(_message("/reset", reply_target))  # type: ignore[attr-defined]

    assert reply_target.messages == [
        (
            123,
            "Sign in is required. Send /login to link this Telegram account.",
        )
    ]


@pytest.mark.asyncio
async def test_on_chat_id_returns_chat_id(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    reply_target = FakeReplyTarget(chat_id=123)
    runner = _build(services)
    update = _update(reply_target.chat_id, "/chat_id", reply_target)

    await runner._on_chat_id(update, Mock())  # type: ignore[arg-type]

    assert reply_target.messages == [(123, "123")]


@pytest.mark.asyncio
async def test_on_logout_unlinks_account(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    token = await create_link_token(
        services.engine,
        telegram_user_id="456",
        telegram_chat_id="123",
    )
    assert (
        await consume_link_token(
            services.engine, token=token, clerk_user_id="clerk-user"
        )
        is not None
    )
    reply_target = FakeReplyTarget(chat_id=123)
    runner = _build(services)
    update = _update(reply_target.chat_id, "/logout", reply_target)

    await runner._on_logout(update, Mock())  # type: ignore[arg-type]

    assert reply_target.messages == [(123, "Telegram access has been unlinked.")]


@pytest.mark.asyncio
async def test_on_logout_reports_no_linked_account(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    reply_target = FakeReplyTarget(chat_id=123)
    runner = _build(services)
    update = _update(reply_target.chat_id, "/logout", reply_target)

    await runner._on_logout(update, Mock())  # type: ignore[arg-type]

    assert reply_target.messages == [(123, "No linked account was found.")]


@pytest.mark.asyncio
async def test_on_unknown_command_sends_help(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    reply_target = FakeReplyTarget(chat_id=123)
    runner = _build(services)
    update = _update(reply_target.chat_id, "/bogus", reply_target)

    await runner._on_unknown(update, Mock())  # type: ignore[arg-type]

    assert reply_target.messages == [(123, "Unknown command. Use /help.")]
