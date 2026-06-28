from collections.abc import AsyncIterator, Awaitable, Callable
from types import SimpleNamespace
from typing import cast
from urllib.parse import parse_qs, urlparse

import pytest
from agents_shared.dependencies import AgentServices
from agents_shared.telegram_auth import consume_link_token, create_link_token
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from telegram_bot.agent_registry import TELEGRAM_AGENT_BY_ID
from telegram_bot.runner import (
    TELEGRAM_MESSAGE_LIMIT,
    TelegramAgentsBot,
    TelegramMessage,
    TelegramSentMessage,
    chunk_text,
    format_state_summary,
    parse_allowed_chat_ids,
)


class FakeSentMessage:
    def __init__(self, target: FakeReplyTarget) -> None:
        self.target = target

    async def edit_text(
        self,
        text: str,
        *,
        disable_web_page_preview: bool = True,
    ) -> object:
        self.target.messages.append((self.target.chat_id, text))
        self.target.disable_web_page_preview_values.append(disable_web_page_preview)
        return self


class FakeReplyTarget:
    def __init__(self, chat_id: int) -> None:
        self.chat_id = chat_id
        self.messages: list[tuple[int, str]] = []
        self.disable_web_page_preview_values: list[bool] = []
        self.reply_markups: list[object] = []

    async def reply_text(
        self,
        text: str,
        *,
        disable_web_page_preview: bool = True,
        reply_markup: object = None,
    ) -> TelegramSentMessage:
        self.messages.append((self.chat_id, text))
        self.disable_web_page_preview_values.append(disable_web_page_preview)
        self.reply_markups.append(reply_markup)
        return FakeSentMessage(self)


@pytest.fixture
async def engine(tmp_path) -> AsyncIterator[AsyncEngine]:
    db_path = tmp_path / "telegram_runner.sqlite"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
    try:
        yield engine
    finally:
        await engine.dispose()


def _bot(
    engine: AsyncEngine,
    *,
    link_base_url: str | None = None,
    connect_url: str | None = None,
    credential_state_loader: Callable[
        [str], Awaitable[tuple[dict[str, object], tuple[str, ...]]]
    ]
    | None = None,
) -> TelegramAgentsBot:
    services = SimpleNamespace(engine=engine)
    return TelegramAgentsBot(
        services=cast(AgentServices, services),
        link_base_url=link_base_url,
        connect_url=connect_url,
        credential_state_loader=credential_state_loader,
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


def test_build_application_registers_commands_and_text_handler(
    engine: AsyncEngine,
) -> None:
    bot = _bot(engine)

    application = bot.build_application("123:test")

    handler_types = {
        type(handler).__name__
        for group_handlers in application.handlers.values()
        for handler in group_handlers
    }
    assert "CommandHandler" in handler_types
    assert "MessageHandler" in handler_types


def test_chunk_text_respects_telegram_message_limit() -> None:
    chunks = chunk_text("a" * (TELEGRAM_MESSAGE_LIMIT + 10))

    assert len(chunks) == 2
    assert all(len(chunk) <= TELEGRAM_MESSAGE_LIMIT for chunk in chunks)


def test_format_state_summary_hides_internal_state() -> None:
    summary = format_state_summary(
        TELEGRAM_AGENT_BY_ID["travel"],
        {
            "user_id": "telegram:1",
            "temp:tool_response:write_itinerary": "hidden",
            "destination": "Lisbon",
            "itinerary": "Day 1\n\nDay 2",
        },
    )

    assert "Travel updated state:" in summary
    assert "destination: Lisbon" in summary
    assert "itinerary: Day 1\nDay 2" in summary
    assert "telegram:1" not in summary
    assert "hidden" not in summary


def test_parse_allowed_chat_ids() -> None:
    assert parse_allowed_chat_ids("123, -456,789") == {123, -456, 789}
    assert parse_allowed_chat_ids(None) == set()


def test_bot_stores_mini_app_url(engine: AsyncEngine) -> None:
    services = SimpleNamespace(engine=engine)
    bot = TelegramAgentsBot(
        services=cast(AgentServices, services),
        mini_app_url="https://example.com/tma",
    )
    assert bot.mini_app_url == "https://example.com/tma"


def test_bot_mini_app_url_defaults_to_none(engine: AsyncEngine) -> None:
    services = SimpleNamespace(engine=engine)
    bot = TelegramAgentsBot(
        services=cast(AgentServices, services),
    )
    assert bot.mini_app_url is None


@pytest.mark.asyncio
async def test_help_command_sends_webapp_button_when_url_set(
    engine: AsyncEngine,
) -> None:
    services = SimpleNamespace(engine=engine)
    bot = TelegramAgentsBot(
        services=cast(AgentServices, services),
        mini_app_url="https://example.com/tma",
    )
    reply_target = FakeReplyTarget(chat_id=123)
    message = _message("/start", reply_target)

    await bot._help_update_for_message(message)  # type: ignore[attr-defined]

    assert len(reply_target.reply_markups) == 1
    assert reply_target.reply_markups[0] is not None


@pytest.mark.asyncio
async def test_help_command_no_webapp_button_when_no_url(engine: AsyncEngine) -> None:
    bot = _bot(engine)
    reply_target = FakeReplyTarget(chat_id=123)
    message = _message("/start", reply_target)

    await bot._help_update_for_message(message)  # type: ignore[attr-defined]

    assert len(reply_target.reply_markups) == 1
    assert reply_target.reply_markups[0] is None


@pytest.mark.asyncio
async def test_login_command_sends_one_time_link(engine: AsyncEngine) -> None:
    reply_target = FakeReplyTarget(chat_id=123)
    bot = _bot(
        engine,
        link_base_url="https://agents.example.com/telegram/link",
    )

    await bot.send_login_link(_message("/login", reply_target))

    assert len(reply_target.messages) == 1
    chat_id, text = reply_target.messages[0]
    assert chat_id == 123
    assert "https://agents.example.com/telegram/link?token=" in text
    token = parse_qs(urlparse(text.splitlines()[-1]).query)["token"][0]
    link = await consume_link_token(
        engine,
        token=token,
        clerk_user_id="clerk-user",
    )
    assert link is not None
    assert link.telegram_user_id == "456"


@pytest.mark.asyncio
async def test_unlinked_message_requires_login_without_building_runtime(
    engine: AsyncEngine,
) -> None:
    reply_target = FakeReplyTarget(chat_id=123)
    bot = _bot(engine)

    await bot.handle_message(_message("plan food", reply_target))

    assert reply_target.messages == [
        (
            123,
            "Sign in is required before I can use your Strava and QFC credentials. "
            "Send /login to link this Telegram account.",
        )
    ]
    assert vars(bot)["_runtimes"] == {}


@pytest.mark.asyncio
async def test_missing_connected_accounts_blocks_agent_run(engine: AsyncEngine) -> None:
    token = await create_link_token(
        engine,
        telegram_user_id="456",
        telegram_chat_id="123",
    )
    assert (
        await consume_link_token(engine, token=token, clerk_user_id="clerk-user")
        is not None
    )
    reply_target = FakeReplyTarget(chat_id=123)

    async def credential_state_loader(
        clerk_user_id: str,
    ) -> tuple[dict[str, object], tuple[str, ...]]:
        assert clerk_user_id == "clerk-user"
        return {"user_id": clerk_user_id}, ("Strava", "Kroger/QFC")

    bot = _bot(
        engine,
        connect_url="https://agents.example.com/console/settings",
        credential_state_loader=credential_state_loader,
    )

    await bot.handle_message(_message("plan food", reply_target))

    assert reply_target.messages == [
        (
            123,
            "Your account is linked, but Strava, Kroger/QFC is not connected yet.\n"
            "Connect it here: https://agents.example.com/console/settings",
        )
    ]
    assert vars(bot)["_runtimes"] == {}
