from collections.abc import AsyncIterator, Awaitable, Callable
from pathlib import Path
from unittest.mock import AsyncMock, Mock, create_autospec
from urllib.parse import parse_qs, urlparse

import pytest
from agents_shared.dependencies import AgentServices
from agents_shared.telegram_auth import consume_link_token, create_link_token
from google.adk.agents import LlmAgent
from pytest_mock import MockerFixture
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from telegram.constants import ParseMode
from telegram.error import Forbidden
from telegram_bot.runner import (
    ORCHESTRATOR_COMPACTION_EVENT_RETENTION_SIZE,
    ORCHESTRATOR_COMPACTION_INTERVAL,
    ORCHESTRATOR_COMPACTION_OVERLAP_SIZE,
    ORCHESTRATOR_COMPACTION_TOKEN_THRESHOLD,
    TELEGRAM_MESSAGE_LIMIT,
    TelegramMessage,
    TelegramRunner,
    TelegramSentMessage,
    _agent_message_text,
    _is_unaddressed_group_message,
    _partition_user_id,
    bot_commands,
    build_telegram_runner,
    chunk_text,
    format_state_summary,
    parse_allowed_chat_ids,
    telegram_message_from_update,
)

CredentialLoader = Callable[[str], Awaitable[tuple[dict[str, object], tuple[str, ...]]]]


class FakeReplyTarget:
    """Implements the ``TelegramReplyTarget`` protocol for the runner."""

    def __init__(self, chat_id: int) -> None:
        self.chat_id = chat_id
        self.messages: list[tuple[int, str]] = []
        self.message_thread_ids: list[int | None] = []
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
        message_thread_id: int | None = None,
    ) -> TelegramSentMessage:
        self.messages.append((self.chat_id, text))
        self.message_thread_ids.append(message_thread_id)
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
        self.target.message_thread_ids.append(None)
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


def _update(
    chat_id: int,
    text: str,
    reply_target: FakeReplyTarget,
    *,
    chat_type: str = "private",
    message_thread_id: int | None = None,
    is_topic_message: bool = False,
    user_id: int = 456,
    user_name: str | None = None,
    user_username: str | None = None,
    is_bot: bool = False,
    reply_to_bot: bool = False,
    reply_to_bot_username: str | None = None,
):
    """Build a minimal ``Update`` carrying one text message."""
    from types import SimpleNamespace

    effective_user = SimpleNamespace(
        id=user_id,
        full_name=user_name,
        username=user_username,
        is_bot=is_bot,
    )
    reply_to_message = None
    if reply_to_bot:
        reply_to_message = SimpleNamespace(
            from_user=SimpleNamespace(
                is_bot=True,
                id=999,
                username=reply_to_bot_username,
            ),
        )
    return SimpleNamespace(
        effective_message=SimpleNamespace(
            text=text,
            message_id=99,
            message_thread_id=message_thread_id,
            is_topic_message=is_topic_message,
            reply_text=reply_target.reply_text,
            reply_to_message=reply_to_message,
        ),
        effective_chat=SimpleNamespace(id=chat_id, type=chat_type),
        effective_user=effective_user,
    )


def _build(
    services: AgentServices,
    *,
    link_base_url: str | None = None,
    connect_url: str | None = None,
    credential_loader: CredentialLoader | None = None,
    mini_app_url: str | None = None,
    bot_username: str | None = None,
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
        bot_username=bot_username,
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


def test_bot_commands_expose_only_orchestrator_entrypoints() -> None:
    commands = {command.command: command.description for command in bot_commands()}

    assert commands["help"] == "Show help and onboarding"
    assert commands["login"] == "Link Telegram to your web account"
    assert commands["new"] == "Start a fresh AI conversation"
    assert "agents" not in commands
    assert "agent" not in commands


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


def test_format_state_summary_labels_grocery_list_and_live_cart() -> None:
    summary = format_state_summary(
        {
            "shopping_list": ["milk"],
            "cart": [
                {
                    "name": "Simple Truth Organic Milk",
                    "quantity": 1,
                    "price": 4.29,
                    "upc": "00011110042908",
                }
            ],
        },
    )

    assert ("shopping_list (not yet in live Kroger cart): milk") in summary
    assert "cart (live Kroger cart; moved/added for checkout):" in summary


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

    assert reply_target.messages[0] == (123, r"Here is the plan\.")
    assert reply_target.parse_modes[0] == ParseMode.MARKDOWN_V2


@pytest.mark.asyncio
async def test_group_message_without_bot_mention_is_ignored(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    """Group chats should not route every ambient message into an AI run."""
    reply_target = FakeReplyTarget(chat_id=-123)
    runner = _build(services, bot_username="agents_bot")

    await runner.handle_message(
        TelegramMessage(
            chat_id=-123,
            user_id=456,
            text="what should we cook tonight?",
            message_id=99,
            chat_type="group",
            reply_target=reply_target,
        )
    )

    assert reply_target.messages == []


@pytest.mark.asyncio
async def test_topic_group_message_uses_topic_session_and_state(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    """Forum topics should isolate ADK sessions inside the same group."""
    from google.genai import types

    token = await create_link_token(
        services.engine,
        telegram_user_id="456",
        telegram_chat_id="-100123",
    )
    assert (
        await consume_link_token(
            services.engine, token=token, clerk_user_id="clerk-user"
        )
        is not None
    )
    reply_target = FakeReplyTarget(chat_id=-100123)

    async def credential_state_loader(
        clerk_user_id: str,
    ) -> tuple[dict[str, object], tuple[str, ...]]:
        return {"user_id": clerk_user_id}, ()

    runner = _build(
        services,
        credential_loader=credential_state_loader,
        bot_username="agents_bot",
    )
    captured: dict[str, object] = {}

    async def fake_run_async(*, user_id, session_id, new_message, state_delta):
        captured["session_id"] = session_id
        captured["user_id"] = user_id
        captured["state_delta"] = state_delta
        captured["text"] = new_message.parts[0].text
        yield _Event(
            content=types.Content(
                role="model",
                parts=[types.Part(text="Topic plan ready.")],
            )
        )

    runner.runner.run_async = fake_run_async  # type: ignore[method-assign]

    await runner.handle_message(
        TelegramMessage(
            chat_id=-100123,
            user_id=456,
            text="@agents_bot plan food for this topic",
            message_id=99,
            chat_type="supergroup",
            message_thread_id=42,
            is_topic_message=True,
            reply_target=reply_target,
            user_name="Alice",
        )
    )

    assert captured["session_id"] == "telegram:-100123:topic:42:orchestrator"
    assert captured["user_id"] == "telegram:group:-100123:topic:42"
    assert captured["text"] == "Alice: plan food for this topic"
    assert captured["state_delta"] == {
        "sender_linked": True,
        "kroger_connected": False,
        "strava_connected": False,
        "user_id": "clerk-user",
        "telegram_chat_id": "-100123",
        "telegram_user_id": "456",
        "telegram_message_thread_id": "42",
    }
    assert reply_target.message_thread_ids[0] == 42
    assert reply_target.messages[-1] == (-100123, r"Topic plan ready\.")


@pytest.mark.asyncio
async def test_non_topic_group_message_does_not_use_reply_thread_as_session(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    """Reply-derived thread IDs in normal groups should not fragment sessions."""
    from google.genai import types

    token = await create_link_token(
        services.engine,
        telegram_user_id="456",
        telegram_chat_id="-100123",
    )
    assert (
        await consume_link_token(
            services.engine, token=token, clerk_user_id="clerk-user"
        )
        is not None
    )
    reply_target = FakeReplyTarget(chat_id=-100123)

    async def credential_state_loader(
        clerk_user_id: str,
    ) -> tuple[dict[str, object], tuple[str, ...]]:
        return {"user_id": clerk_user_id}, ()

    runner = _build(
        services,
        credential_loader=credential_state_loader,
        bot_username="agents_bot",
    )
    captured: dict[str, object] = {}

    async def fake_run_async(*, user_id, session_id, new_message, state_delta):
        captured["session_id"] = session_id
        captured["state_delta"] = state_delta
        yield _Event(
            content=types.Content(
                role="model",
                parts=[types.Part(text="Group plan ready.")],
            )
        )

    runner.runner.run_async = fake_run_async  # type: ignore[method-assign]

    await runner.handle_message(
        TelegramMessage(
            chat_id=-100123,
            user_id=456,
            text="@agents_bot plan food",
            message_id=99,
            chat_type="supergroup",
            message_thread_id=987,
            is_topic_message=False,
            reply_target=reply_target,
        )
    )

    assert captured["session_id"] == "telegram:-100123:orchestrator"
    assert captured["state_delta"] == {
        "sender_linked": True,
        "kroger_connected": False,
        "strava_connected": False,
        "user_id": "clerk-user",
        "telegram_chat_id": "-100123",
        "telegram_user_id": "456",
    }
    assert reply_target.message_thread_ids[0] is None


@pytest.mark.asyncio
async def test_handle_message_sends_agent_text_as_escaped_markdownv2(
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

    assert reply_target.messages[0] == (123, r"Done\! Use A\+B \= C\.")
    assert reply_target.parse_modes[0] == ParseMode.MARKDOWN_V2


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
async def test_handle_message_strips_reasoning_parts(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    """Reasoning (thought=True) parts are dropped; only the final answer is sent."""
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
                parts=[
                    types.Part(text="Let me think this through...", thought=True),
                    types.Part(text="Here is the answer."),
                ],
            )
        )

    runner.runner.run_async = fake_run_async  # type: ignore[method-assign]

    await runner.handle_message(_message("hi", reply_target))

    assert (123, r"Here is the answer\.") in reply_target.messages
    assert not any(
        "Let me think this through" in text for _, text in reply_target.messages
    )


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
        "*Grocery agent:*\n" + r"I drafted meals for the week\.",
    ) in reply_target.messages
    assert (
        123,
        "*Fitness agent:*\n" + r"I added three easy runs\.",
    ) in reply_target.messages
    assert reply_target.messages[-1] == (123, r"Your wellness plan is ready\.")


@pytest.mark.asyncio
async def test_handle_message_emits_nonfinal_subagent_text_as_progress_messages(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    """Sub-agent text should be posted while the root run is still in progress."""
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
                parts=[types.Part(text="I found current Kroger deals.")],
            ),
            final=False,
        )
        yield _Event(
            author="grocery_agent",
            content=types.Content(
                role="model",
                parts=[types.Part(text="I am matching products for the cart.")],
            ),
            final=False,
        )
        yield _Event(
            author="telegram_orchestrator_agent",
            content=types.Content(
                role="model",
                parts=[types.Part(text="Your grocery plan is ready.")],
            ),
        )

    runner.runner.run_async = fake_run_async  # type: ignore[method-assign]

    await runner.handle_message(_message("plan food", reply_target))

    assert (
        123,
        "*Grocery agent:*\n" + r"I found current Kroger deals\.",
    ) in reply_target.messages
    assert (
        123,
        "*Grocery agent:*\n" + r"I am matching products for the cart\.",
    ) in reply_target.messages
    assert reply_target.messages[-1] == (123, r"Your grocery plan is ready\.")


@pytest.mark.asyncio
async def test_handle_message_chunks_oversized_subagent_text(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    """A sub-agent that dumps a huge blob of text must be split into chunks

    that each stay under Telegram's 4096-char message limit, instead of
    being forwarded as a single oversized message (which Telegram's API
    rejects with "Message is too long").
    """
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

    huge_text = "line of grocery state\n" * 400  # well over TELEGRAM_MESSAGE_LIMIT

    async def fake_run_async(*, user_id, session_id, new_message, state_delta):
        yield _Event(
            author="grocery_agent",
            content=types.Content(
                role="model",
                parts=[types.Part(text=huge_text)],
            ),
        )
        yield _Event(
            author="telegram_orchestrator_agent",
            content=types.Content(
                role="model",
                parts=[types.Part(text="Your grocery plan is ready.")],
            ),
        )

    runner.runner.run_async = fake_run_async  # type: ignore[method-assign]

    await runner.handle_message(_message("plan food", reply_target))

    assert all(len(text) <= TELEGRAM_MESSAGE_LIMIT for _, text in reply_target.messages)
    assert len(reply_target.messages) > 2
    assert reply_target.messages[-1] == (123, r"Your grocery plan is ready\.")


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
async def test_unlinked_message_runs_agent_anonymously(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    """Unlinked senders chat anonymously — no public 'sign in required' reply."""
    from google.genai import types

    runner = _build(services)
    reply_target = FakeReplyTarget(chat_id=123)
    captured: dict[str, object] = {}

    async def fake_run_async(*, user_id, session_id, new_message, state_delta):
        captured["user_id"] = user_id
        captured["session_id"] = session_id
        captured["state_delta"] = state_delta
        yield _Event(
            content=types.Content(
                role="model",
                parts=[types.Part(text="Hi there!")],
            )
        )

    runner.runner.run_async = fake_run_async  # type: ignore[method-assign]

    await runner.handle_message(_message("plan food", reply_target))

    # No public "Sign in is required" reply.
    assert all("Sign in is required" not in text for _, text in reply_target.messages)
    # Agent ran with anonymous partition and credentials disabled.
    assert captured["user_id"] == "telegram:anon:456"
    assert captured["state_delta"] == {
        "sender_linked": False,
        "kroger_connected": False,
        "strava_connected": False,
        "telegram_chat_id": "123",
        "telegram_user_id": "456",
    }
    assert reply_target.messages[-1] == (123, r"Hi there\!")


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
    assert any(r"I can help with that\." in text for _, text in reply_target.messages)


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
async def test_reset_session_works_for_unlinked_user(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    """``/reset`` works for unlinked senders in any chat (room-scoped partition)."""
    reply_target = FakeReplyTarget(chat_id=123)
    runner = _build(services)

    await runner._reset_session(_message("/reset", reply_target))  # type: ignore[attr-defined]

    assert reply_target.messages == [(123, "Reset Orchestrator for this chat.")]


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
async def test_on_chat_id_returns_topic_id_in_forum_topic(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    reply_target = FakeReplyTarget(chat_id=-100123)
    runner = _build(services)
    update = _update(
        reply_target.chat_id,
        "/chat_id",
        reply_target,
        chat_type="supergroup",
        message_thread_id=42,
        is_topic_message=True,
    )

    await runner._on_chat_id(update, Mock())  # type: ignore[arg-type]

    assert reply_target.messages == [(-100123, "chat_id: -100123\ntopic_id: 42")]
    assert reply_target.message_thread_ids == [42]


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


# ---------------------------------------------------------------------------
# Group chat: per-topic shared sessions, mixed auth, DM nudge
# ---------------------------------------------------------------------------


def test_partition_user_id_returns_room_key_for_forum_topic() -> None:
    """Forum topics share one room-scoped partition across participants."""
    message = TelegramMessage(
        chat_id=-100123,
        user_id=456,
        text="hi",
        chat_type="supergroup",
        message_thread_id=42,
        is_topic_message=True,
    )

    assert (
        _partition_user_id(message, "clerk-alice") == "telegram:group:-100123:topic:42"
    )
    assert _partition_user_id(message, "clerk-bob") == "telegram:group:-100123:topic:42"
    assert _partition_user_id(message, None) == "telegram:group:-100123:topic:42"


def test_partition_user_id_keeps_clerk_user_for_private_chats() -> None:
    """Private chats keep the sender's Clerk id as the partition."""
    message = TelegramMessage(
        chat_id=123,
        user_id=456,
        text="hi",
        chat_type="private",
    )

    assert _partition_user_id(message, "clerk-alice") == "clerk-alice"


def test_partition_user_id_falls_back_to_anon_id_when_unlinked() -> None:
    message = TelegramMessage(
        chat_id=123,
        user_id=456,
        text="hi",
        chat_type="private",
    )

    assert _partition_user_id(message, None) == "telegram:anon:456"


def test_partition_user_id_keeps_clerk_user_for_non_topic_group() -> None:
    """Plain (non-topic) group messages keep per-Clerk-user partitioning."""
    message = TelegramMessage(
        chat_id=-100123,
        user_id=456,
        text="hi",
        chat_type="supergroup",
        message_thread_id=987,
        is_topic_message=False,
    )

    assert _partition_user_id(message, "clerk-alice") == "clerk-alice"
    assert _partition_user_id(message, "clerk-bob") == "clerk-bob"
    assert _partition_user_id(message, None) == "telegram:anon:456"


def test_agent_message_text_prefixes_author_only_in_shared_topic() -> None:
    private = TelegramMessage(
        chat_id=123,
        user_id=456,
        text="hello",
        chat_type="private",
        user_name="Alice",
    )
    topic = TelegramMessage(
        chat_id=-100123,
        user_id=456,
        text="@agents_bot plan food",
        chat_type="supergroup",
        message_thread_id=42,
        is_topic_message=True,
        user_name="Alice",
    )
    group = TelegramMessage(
        chat_id=-100123,
        user_id=456,
        text="@agents_bot hello",
        chat_type="supergroup",
        message_thread_id=987,
        is_topic_message=False,
        user_name="Alice",
    )

    assert _agent_message_text(private, "agents_bot") == "hello"
    assert _agent_message_text(topic, "agents_bot") == "Alice: plan food"
    # Non-topic group: mention stripped, no author prefix.
    assert _agent_message_text(group, "agents_bot") == "hello"


def test_is_unaddressed_group_message_treats_reply_to_bot_as_addressed() -> None:
    bot_username = "agents_bot"
    reply = TelegramMessage(
        chat_id=-100123,
        user_id=456,
        text="anything without a mention",
        chat_type="supergroup",
        reply_to_bot=True,
        reply_to_bot_username="agents_bot",
    )
    plain = TelegramMessage(
        chat_id=-100123,
        user_id=456,
        text="ambient chatter",
        chat_type="supergroup",
    )

    assert _is_unaddressed_group_message(reply, bot_username) is False
    assert _is_unaddressed_group_message(plain, bot_username) is True


def test_group_reply_to_different_bot_is_not_addressed() -> None:
    reply_target = FakeReplyTarget(chat_id=-100123)
    update = _update(
        -100123,
        "this is for the other bot",
        reply_target,
        chat_type="supergroup",
        reply_to_bot=True,
        reply_to_bot_username="other_bot",
    )
    message = telegram_message_from_update(update)

    assert message is not None
    assert _is_unaddressed_group_message(message, "agents_bot") is True


def test_group_reply_to_this_bot_is_addressed() -> None:
    reply_target = FakeReplyTarget(chat_id=-100123)
    update = _update(
        -100123,
        "continue",
        reply_target,
        chat_type="supergroup",
        reply_to_bot=True,
        reply_to_bot_username="agents_bot",
    )
    message = telegram_message_from_update(update)

    assert message is not None
    assert _is_unaddressed_group_message(message, "agents_bot") is False


def test_readme_documents_current_anonymous_nudge_behavior() -> None:
    readme_path = Path(__file__).parent.parent / "README.md"
    readme = readme_path.read_text(encoding="utf-8")

    assert "normal messages require a linked Clerk account" not in readme
    assert "Unlinked senders can chat anonymously" in readme
    assert "TelegramAgentsBot" not in readme


@pytest.mark.asyncio
async def test_two_senders_in_same_topic_share_one_session(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    """Both speakers in a forum topic resolve to the same ADK session key."""
    from google.genai import types

    for telegram_user_id, clerk_user_id in (
        ("111", "clerk-alice"),
        ("222", "clerk-bob"),
    ):
        token = await create_link_token(
            services.engine,
            telegram_user_id=telegram_user_id,
            telegram_chat_id="-100123",
        )
        assert (
            await consume_link_token(
                services.engine, token=token, clerk_user_id=clerk_user_id
            )
            is not None
        )

    async def credential_state_loader(
        clerk_user_id: str,
    ) -> tuple[dict[str, object], tuple[str, ...]]:
        return {"user_id": clerk_user_id}, ()

    runner = _build(
        services,
        credential_loader=credential_state_loader,
        bot_username="agents_bot",
    )
    captured: list[dict[str, object]] = []

    async def fake_run_async(*, user_id, session_id, new_message, state_delta):
        captured.append(
            {
                "user_id": user_id,
                "session_id": session_id,
                "text": new_message.parts[0].text,
            }
        )
        yield _Event(
            content=types.Content(
                role="model",
                parts=[types.Part(text="ok")],
            )
        )

    runner.runner.run_async = fake_run_async  # type: ignore[method-assign]

    alice_reply = FakeReplyTarget(chat_id=-100123)
    bob_reply = FakeReplyTarget(chat_id=-100123)
    await runner.handle_message(
        TelegramMessage(
            chat_id=-100123,
            user_id=111,
            text="@agents_bot plan food",
            chat_type="supergroup",
            message_thread_id=42,
            is_topic_message=True,
            reply_target=alice_reply,
            user_name="Alice",
        )
    )
    await runner.handle_message(
        TelegramMessage(
            chat_id=-100123,
            user_id=222,
            text="@agents_bot add snacks",
            chat_type="supergroup",
            message_thread_id=42,
            is_topic_message=True,
            reply_target=bob_reply,
            user_name="Bob",
        )
    )

    assert len(captured) == 2
    assert captured[0]["user_id"] == "telegram:group:-100123:topic:42"
    assert captured[1]["user_id"] == "telegram:group:-100123:topic:42"
    assert captured[0]["session_id"] == captured[1]["session_id"]
    assert captured[0]["text"] == "Alice: plan food"
    assert captured[1]["text"] == "Bob: add snacks"


@pytest.mark.asyncio
async def test_unlinked_user_in_topic_runs_anonymously_and_dms_login(
    services: AgentServices,
    orchestrator_agent: Mock,
    mocker: MockerFixture,
) -> None:
    """Unlinked group speaker → agent runs anonymously + DM nudge attempted."""
    from google.genai import types

    runner = _build(
        services,
        link_base_url="https://agents.example.com/telegram/link",
        bot_username="agents_bot",
    )
    reply_target = FakeReplyTarget(chat_id=-100123)
    captured: dict[str, object] = {}

    async def fake_run_async(*, user_id, session_id, new_message, state_delta):
        captured["user_id"] = user_id
        captured["state_delta"] = state_delta
        yield _Event(
            content=types.Content(
                role="model",
                parts=[types.Part(text="Hi!")],
            )
        )

    runner.runner.run_async = fake_run_async  # type: ignore[method-assign]

    send_message = AsyncMock(return_value=None)
    fake_bot = Mock()
    fake_bot.send_message = send_message
    mocker.patch.object(runner.application, "bot", fake_bot)

    await runner.handle_message(
        TelegramMessage(
            chat_id=-100123,
            user_id=456,
            text="@agents_bot plan food",
            chat_type="supergroup",
            message_thread_id=42,
            is_topic_message=True,
            reply_target=reply_target,
            user_name="Guest",
        )
    )

    # DM nudge sent to the user (group context).
    send_message.assert_awaited_once()
    args, kwargs = send_message.call_args
    assert kwargs["chat_id"] == 456
    assert "https://agents.example.com/telegram/link?token=" in kwargs["text"]
    # Agent still ran anonymously in the shared room.
    assert captured["user_id"] == "telegram:group:-100123:topic:42"
    assert captured["state_delta"]["sender_linked"] is False  # type: ignore[index]
    assert reply_target.messages[-1] == (-100123, r"Hi\!")


@pytest.mark.asyncio
async def test_unlinked_dm_nudge_falls_back_to_group_reply_on_forbidden(
    services: AgentServices,
    orchestrator_agent: Mock,
    mocker: MockerFixture,
) -> None:
    """Bot cannot DM the user → a single in-group /login reply is sent instead."""
    from google.genai import types

    runner = _build(
        services,
        link_base_url="https://agents.example.com/telegram/link",
        bot_username="agents_bot",
    )
    reply_target = FakeReplyTarget(chat_id=-100123)

    async def fake_run_async(*, user_id, session_id, new_message, state_delta):
        yield _Event(
            content=types.Content(
                role="model",
                parts=[types.Part(text="ok")],
            )
        )

    runner.runner.run_async = fake_run_async  # type: ignore[method-assign]

    send_message = AsyncMock(side_effect=Forbidden("blocked"))
    fake_bot = Mock()
    fake_bot.send_message = send_message
    mocker.patch.object(runner.application, "bot", fake_bot)

    await runner.handle_message(
        TelegramMessage(
            chat_id=-100123,
            user_id=789,
            text="@agents_bot hi",
            chat_type="supergroup",
            message_thread_id=42,
            is_topic_message=True,
            reply_target=reply_target,
        )
    )

    send_message.assert_awaited_once()
    assert any(
        "https://agents.example.com/telegram/link?token=" in text
        for _, text in reply_target.messages
    )


@pytest.mark.asyncio
async def test_login_nudge_is_one_time_per_process(
    services: AgentServices,
    orchestrator_agent: Mock,
    mocker: MockerFixture,
) -> None:
    """The DM nudge is sent at most once per Telegram user per process."""
    from google.genai import types

    runner = _build(
        services,
        link_base_url="https://agents.example.com/telegram/link",
        bot_username="agents_bot",
    )
    send_message = AsyncMock(return_value=None)
    fake_bot = Mock()
    fake_bot.send_message = send_message
    mocker.patch.object(runner.application, "bot", fake_bot)

    async def fake_run_async(*, user_id, session_id, new_message, state_delta):
        yield _Event(
            content=types.Content(
                role="model",
                parts=[types.Part(text="ok")],
            )
        )

    runner.runner.run_async = fake_run_async  # type: ignore[method-assign]

    for _ in range(2):
        await runner.handle_message(
            TelegramMessage(
                chat_id=-100123,
                user_id=789,
                text="@agents_bot hi",
                chat_type="supergroup",
                message_thread_id=42,
                is_topic_message=True,
                reply_target=FakeReplyTarget(chat_id=-100123),
            )
        )

    assert send_message.await_count == 1
    assert 789 in runner._nudged_users  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_concurrent_topic_runs_are_serialized(
    services: AgentServices,
    orchestrator_agent: Mock,
) -> None:
    """Concurrent messages in the same topic must not interleave ``run_async`` calls."""
    import asyncio

    from google.genai import types

    token = await create_link_token(
        services.engine,
        telegram_user_id="456",
        telegram_chat_id="-100123",
    )
    assert (
        await consume_link_token(
            services.engine, token=token, clerk_user_id="clerk-user"
        )
        is not None
    )

    async def credential_state_loader(
        clerk_user_id: str,
    ) -> tuple[dict[str, object], tuple[str, ...]]:
        return {"user_id": clerk_user_id}, ()

    runner = _build(
        services,
        credential_loader=credential_state_loader,
        bot_username="agents_bot",
    )

    order: list[str] = []
    finish = asyncio.Event()

    async def fake_run_async(*, user_id, session_id, new_message, state_delta):
        order.append(f"start:{new_message.parts[0].text}")
        await finish.wait()
        order.append(f"end:{new_message.parts[0].text}")
        yield _Event(
            content=types.Content(
                role="model",
                parts=[types.Part(text="ok")],
            )
        )

    runner.runner.run_async = fake_run_async  # type: ignore[method-assign]

    async def _send(text: str) -> None:
        await runner.handle_message(
            TelegramMessage(
                chat_id=-100123,
                user_id=456,
                text=f"@agents_bot {text}",
                chat_type="supergroup",
                message_thread_id=42,
                is_topic_message=True,
                reply_target=FakeReplyTarget(chat_id=-100123),
                user_name="Alice",
            )
        )

    first = asyncio.create_task(_send("first"))
    await asyncio.sleep(0)
    second = asyncio.create_task(_send("second"))
    await asyncio.sleep(0)
    finish.set()
    await asyncio.gather(first, second)

    # The two runs cannot overlap — the second ``start`` is observed only after
    # the first ``end`` because the per-session lock serializes them.
    assert order == [
        "start:Alice: first",
        "end:Alice: first",
        "start:Alice: second",
        "end:Alice: second",
    ]
