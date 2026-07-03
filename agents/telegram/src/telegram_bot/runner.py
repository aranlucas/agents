"""Telegram Bot API runner for the orchestrator ADK agent.

Mirrors ``google.adk.integrations.slack.SlackRunner`` — a thin wrapper that
bridges a :class:`telegram.ext.Application` with an ADK :class:`Runner`. The
Telegram-specific auth, credential, and session concerns are factored out into
small :class:`TelegramAuth`, :class:`CredentialGate`, and
:class:`SessionManager` dependencies so the runner stays focused on the
``receive message → run agent → edit thinking message`` loop.
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import Awaitable, Callable, Iterable, Mapping
from dataclasses import dataclass
from typing import Protocol, cast, runtime_checkable
from urllib.parse import urlencode

from agents_shared.dependencies import AgentServices, create_agent_services
from agents_shared.plugins.slim_mcp import SlimMcpPlugin
from agents_shared.telegram_auth import (
    create_link_token,
    get_linked_clerk_user_id,
    sync_unlink_to_clerk,
    telegram_credential_state,
    unlink_telegram_user,
)
from google.adk.apps import App
from google.adk.apps.app import EventsCompactionConfig
from google.adk.apps.llm_event_summarizer import LlmEventSummarizer
from google.adk.events import Event
from google.adk.models.lite_llm import LiteLlm
from google.adk.runners import Runner
from google.adk.sessions import BaseSessionService
from google.genai import types
from pydantic import TypeAdapter
from sqlalchemy.ext.asyncio import AsyncEngine
from telegram import (
    BotCommand,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    Update,
    User,
    WebAppInfo,
)
from telegram.constants import ParseMode
from telegram.error import BadRequest, Forbidden
from telegram.ext import (
    Application,
    ApplicationBuilder,
    CommandHandler,
    ContextTypes,
    ExtBot,
    JobQueue,
    MessageHandler,
    filters,
)
from telegram.helpers import escape_markdown

from .orchestrator import (
    ORCHESTRATOR_AGENT_ID,
    ORCHESTRATOR_TITLE,
    TELEGRAM_ORCHESTRATOR_MODEL,
    build_orchestrator_agent,
)

log = logging.getLogger(__name__)

TELEGRAM_MESSAGE_LIMIT = 4096
DEFAULT_RUN_TIMEOUT_SECONDS = 180.0
ORCHESTRATOR_COMPACTION_INTERVAL = 20
ORCHESTRATOR_COMPACTION_OVERLAP_SIZE = 2
ORCHESTRATOR_COMPACTION_TOKEN_THRESHOLD = 120_000
ORCHESTRATOR_COMPACTION_EVENT_RETENTION_SIZE = 20
_HIDDEN_STATE_PREFIXES = ("temp:", "_")
_HIDDEN_STATE_KEYS = frozenset(
    {
        "user_id",
        "telegram_chat_id",
        "telegram_message_thread_id",
        "telegram_user_id",
        "interests",
    }
)
StateValue = object
CredentialState = tuple[dict[str, StateValue], tuple[str, ...]]
CredentialLoader = Callable[[str], Awaitable[CredentialState]]
_OBJECT_LIST = TypeAdapter(list[object])
_OBJECT_DICT = TypeAdapter(dict[object, object])


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


type TelegramApplication = Application[
    ExtBot[None],
    ContextTypes.DEFAULT_TYPE,
    dict[str, object],
    dict[str, object],
    dict[str, object],
    JobQueue[ContextTypes.DEFAULT_TYPE],
]


class _TelegramApplicationBuilder(Protocol):
    def token(self, token: str) -> _TelegramApplicationBuilder: ...

    def post_init(
        self,
        post_init: Callable[[TelegramApplication], Awaitable[None]],
    ) -> _TelegramApplicationBuilder: ...

    def build(self) -> TelegramApplication: ...


class TelegramSentMessage(Protocol):
    async def edit_text(
        self,
        text: str,
        *,
        disable_web_page_preview: bool = True,
        parse_mode: str | None = None,
    ) -> object: ...


class TelegramBot(Protocol):
    async def send_message(
        self,
        chat_id: int,
        text: str,
        *,
        disable_web_page_preview: bool = True,
        reply_markup: InlineKeyboardMarkup | None = None,
        parse_mode: str | None = None,
        message_thread_id: int | None = None,
    ) -> TelegramSentMessage: ...


@runtime_checkable
class TelegramReplyTarget(Protocol):
    def get_bot(self) -> TelegramBot: ...

    async def reply_text(
        self,
        text: str,
        *,
        disable_web_page_preview: bool = True,
        reply_markup: InlineKeyboardMarkup | None = None,
        parse_mode: str | None = None,
        message_thread_id: int | None = None,
    ) -> TelegramSentMessage: ...


@dataclass(frozen=True)
class TelegramMessage:
    chat_id: int
    user_id: int
    text: str
    message_id: int | None = None
    chat_type: str = "private"
    message_thread_id: int | None = None
    is_topic_message: bool = False
    reply_target: TelegramReplyTarget | None = None
    user_name: str | None = None
    reply_to_bot: bool = False
    reply_to_bot_username: str | None = None


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------


@dataclass
class TelegramAuth:
    """Telegram ↔ Clerk account linking."""

    engine: AsyncEngine
    link_base_url: str | None = None

    async def linked_user_id(self, telegram_user_id: int) -> str | None:
        return await get_linked_clerk_user_id(
            self.engine,
            telegram_user_id=str(telegram_user_id),
        )

    async def build_login_url(
        self, *, telegram_user_id: int, telegram_chat_id: int
    ) -> str | None:
        if not self.link_base_url:
            return None
        token = await create_link_token(
            self.engine,
            telegram_user_id=str(telegram_user_id),
            telegram_chat_id=str(telegram_chat_id),
        )
        separator = "&" if "?" in self.link_base_url else "?"
        return f"{self.link_base_url}{separator}{urlencode({'token': token})}"

    async def unlink(self, telegram_user_id: int) -> bool:
        unlinked = await unlink_telegram_user(
            self.engine,
            telegram_user_id=str(telegram_user_id),
        )
        # Also drop the Clerk-side mirror; otherwise the external_id fallback
        # in get_linked_clerk_user_id would silently re-link the sender.
        await sync_unlink_to_clerk(telegram_user_id=str(telegram_user_id))
        return unlinked


@dataclass
class CredentialGate:
    """Verifies that the linked Clerk user has the required integrations."""

    connect_url: str | None = None
    loader: CredentialLoader | None = None

    async def check(self, clerk_user_id: str) -> CredentialState:
        if self.loader is not None:
            return await self.loader(clerk_user_id)
        state = await telegram_credential_state(clerk_user_id)
        return state.state, state.missing

    @staticmethod
    def format_missing(missing: Iterable[str], connect_url: str | None) -> str:
        providers = ", ".join(missing)
        missing_list = list(missing)
        verb = "are" if len(missing_list) > 1 else "is"
        text = f"Your account is linked, but {providers} {verb} not connected yet."
        if connect_url:
            return text + f"\nConnect it here: {connect_url}"
        return text + "\nOpen the web app settings page to connect it, then try again."


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------


_LOGIN_REQUIRED_TEXT = "Sign in is required. Send /login to link this Telegram account."


def _session_id(message: TelegramMessage) -> str:
    topic_id = _session_topic_id(message)
    if topic_id is not None:
        return f"telegram:{message.chat_id}:topic:{topic_id}:{ORCHESTRATOR_AGENT_ID}"
    return f"telegram:{message.chat_id}:{ORCHESTRATOR_AGENT_ID}"


def _partition_user_id(message: TelegramMessage, clerk_user_id: str | None) -> str:
    """Return the ADK ``user_id`` used to key the session for ``message``.

    Forum topics share one room-scoped partition across all participants so
    every speaker in the topic resolves to the same ADK session. Private
    chats and non-topic group messages keep the sender's Clerk id (or an
    anonymous fallback) as the partition.
    """
    topic_id = _session_topic_id(message)
    if topic_id is not None:
        return f"telegram:group:{message.chat_id}:topic:{topic_id}"
    return clerk_user_id or f"telegram:anon:{message.user_id}"


def _is_shared_topic_session(message: TelegramMessage) -> bool:
    return _session_topic_id(message) is not None


def _telegram_state(message: TelegramMessage) -> dict[str, str]:
    state = {
        "telegram_chat_id": str(message.chat_id),
        "telegram_user_id": str(message.user_id),
    }
    topic_id = _session_topic_id(message)
    if topic_id is not None:
        state["telegram_message_thread_id"] = str(topic_id)
    return state


def _identity_state(
    message: TelegramMessage,
    *,
    clerk_user_id: str | None,
    credential_state: Mapping[str, StateValue],
) -> dict[str, StateValue]:
    """Per-turn identity / credential flags for the orchestrator.

    The values reflect the *current sender* even inside a shared topic
    session. ``kroger_connected`` and ``strava_connected`` are written into
    ``state_delta`` as plain keys (not ``temp:``) so the orchestrator's
    instruction-template (``{kroger_connected?}``) resolves correctly; the
    per-turn tokens stay ``temp:``-prefixed and never persist.
    """
    sender_linked = clerk_user_id is not None
    identity: dict[str, StateValue] = {
        "sender_linked": sender_linked,
        "kroger_connected": False,
        "strava_connected": False,
    }
    if sender_linked:
        identity["user_id"] = clerk_user_id
        for key, value in credential_state.items():
            if key == "user_id":
                continue
            identity[key] = value
    return identity


async def _ensure_session(
    session_service: BaseSessionService,
    *,
    message: TelegramMessage,
    partition_user_id: str,
    initial_state: Mapping[str, StateValue],
) -> None:
    session_id = _session_id(message)
    session = await session_service.get_session(
        app_name=ORCHESTRATOR_AGENT_ID,
        user_id=partition_user_id,
        session_id=session_id,
    )
    if session is None:
        await session_service.create_session(
            app_name=ORCHESTRATOR_AGENT_ID,
            user_id=partition_user_id,
            session_id=session_id,
            state={
                **initial_state,
                **_telegram_state(message),
            },
        )


async def _reset_session(
    session_service: BaseSessionService,
    *,
    message: TelegramMessage,
    partition_user_id: str,
) -> None:
    await session_service.delete_session(
        app_name=ORCHESTRATOR_AGENT_ID,
        user_id=partition_user_id,
        session_id=_session_id(message),
    )
    await _ensure_session(
        session_service,
        message=message,
        partition_user_id=partition_user_id,
        initial_state={},
    )


async def _state_summary(
    session_service: BaseSessionService,
    *,
    message: TelegramMessage,
    partition_user_id: str,
    delta: Mapping[str, StateValue],
) -> str:
    session = await session_service.get_session(
        app_name=ORCHESTRATOR_AGENT_ID,
        user_id=partition_user_id,
        session_id=_session_id(message),
    )
    state = dict(session.state) if session is not None else {}
    state.update(delta)
    return format_state_summary(state)


class TelegramRunner:
    """Telegram adapter for an ADK ``Runner`` — Slack-style messaging loop."""

    def __init__(
        self,
        *,
        runner: Runner,
        application: TelegramApplication,
        session_service: BaseSessionService,
        auth: TelegramAuth,
        credentials: CredentialGate,
        allowed_chat_ids: set[int] | None = None,
        mini_app_url: str | None = None,
        bot_username: str | None = None,
        debug: bool = False,
        run_timeout_seconds: float | None = None,
    ) -> None:
        self.runner = runner
        self.application = application
        self.session_service = session_service
        self.auth = auth
        self.credentials = credentials
        self.allowed_chat_ids = frozenset(allowed_chat_ids or set())
        self.mini_app_url = mini_app_url
        self.bot_username = _normalize_bot_username(bot_username)
        self.debug = debug
        self.run_timeout_seconds = run_timeout_seconds
        self._session_locks: dict[str, asyncio.Lock] = {}
        self._session_locks_guard = asyncio.Lock()
        self._session_tasks: dict[str, asyncio.Task[None]] = {}
        self._session_tasks_guard = asyncio.Lock()
        self._nudged_users: set[int] = set()
        self._setup_handlers()

    def _setup_handlers(self) -> None:
        self.application.add_handler(CommandHandler(["start", "help"], self._on_help))
        self.application.add_handler(CommandHandler("login", self._on_login))
        self.application.add_handler(
            CommandHandler(["logout", "unlink"], self._on_logout)
        )
        self.application.add_handler(CommandHandler(["reset", "new"], self._on_reset))
        self.application.add_handler(CommandHandler("stop", self._on_stop))
        self.application.add_handler(CommandHandler("chat_id", self._on_chat_id))
        self.application.add_handler(MessageHandler(filters.COMMAND, self._on_unknown))
        self.application.add_handler(
            MessageHandler(filters.TEXT & ~filters.COMMAND, self._on_text)
        )
        self.application.add_error_handler(self._on_error)

    def run_polling(self, *, timeout: int = 50) -> None:
        log.info("Telegram runner polling started")
        self.application.run_polling(
            timeout=timeout,
            allowed_updates=["message"],
        )

    async def handle_message(self, message: TelegramMessage) -> None:
        """Core agent run loop — the Telegram equivalent of ``SlackRunner._handle_message``."""
        if not self._is_allowed(message):
            return
        if _is_unaddressed_group_message(message, self.bot_username):
            return

        clerk_user_id = await self.auth.linked_user_id(message.user_id)
        credential_state: dict[str, StateValue] = {}
        if clerk_user_id is not None:
            credential_state, missing = await self.credentials.check(clerk_user_id)
            if missing:
                log.debug(
                    "Telegram user %s missing credentials: %s",
                    clerk_user_id,
                    missing,
                )
        elif message.user_id not in self._nudged_users:
            await self._nudge_login(message)

        partition_user_id = _partition_user_id(message, clerk_user_id)
        session_id = _session_id(message)
        session_lock = await self._session_lock_for(session_id)
        current_task = asyncio.current_task()
        if current_task is not None:
            async with self._session_tasks_guard:
                self._session_tasks[session_id] = current_task
        try:
            async with session_lock:
                await self._run_agent(
                    message,
                    partition_user_id=partition_user_id,
                    clerk_user_id=clerk_user_id,
                    credential_state=credential_state,
                )
        finally:
            if current_task is not None:
                async with self._session_tasks_guard:
                    if self._session_tasks.get(session_id) is current_task:
                        self._session_tasks.pop(session_id, None)

    async def _run_agent(
        self,
        message: TelegramMessage,
        *,
        partition_user_id: str,
        clerk_user_id: str | None,
        credential_state: Mapping[str, StateValue],
    ) -> None:
        identity_state = _identity_state(
            message,
            clerk_user_id=clerk_user_id,
            credential_state=credential_state,
        )

        await _ensure_session(
            self.session_service,
            message=message,
            partition_user_id=partition_user_id,
            initial_state=identity_state,
        )

        response_texts: list[str] = []
        state_delta: dict[str, StateValue] = {}
        try:
            new_message = types.Content(
                role="user",
                parts=[
                    types.Part(text=_agent_message_text(message, self.bot_username))
                ],
            )
            iterator = self.runner.run_async(
                user_id=partition_user_id,
                session_id=_session_id(message),
                new_message=new_message,
                state_delta={
                    **identity_state,
                    **_telegram_state(message),
                },
            )
            consume = self._consume_event
            if self.run_timeout_seconds is None:
                async for event in iterator:
                    await consume(event, message, state_delta, response_texts)
            else:
                async with asyncio.timeout(self.run_timeout_seconds):
                    async for event in iterator:
                        await consume(event, message, state_delta, response_texts)

            text = _dedupe_join(response_texts)
            if not text:
                text = await _state_summary(
                    self.session_service,
                    message=message,
                    partition_user_id=partition_user_id,
                    delta={**identity_state, **state_delta},
                )
            if not text:
                text = "Done."
            await self._send_markdown(message, text)
        except TimeoutError:
            if self.run_timeout_seconds is not None:
                log.warning(
                    "Telegram agent run timed out for %s after %.1fs",
                    ORCHESTRATOR_AGENT_ID,
                    self.run_timeout_seconds,
                )
            await self._send_markdown(
                message,
                (
                    f"Sorry, {ORCHESTRATOR_TITLE} took too long to finish. "
                    "Try again with a narrower request, or send /reset and retry."
                ),
            )
        except Exception as exc:
            log.exception("Telegram agent run failed for %s", ORCHESTRATOR_AGENT_ID)
            await self._send_markdown(
                message,
                f"Sorry, {ORCHESTRATOR_TITLE} hit an error: {exc}",
            )

    async def _consume_event(
        self,
        event: Event,
        message: TelegramMessage,
        state_delta: dict[str, StateValue],
        response_texts: list[str],
    ) -> None:
        if event.actions and event.actions.state_delta:
            state_delta.update(event.actions.state_delta)
        if event.error_message:
            raise RuntimeError(event.error_message)
        if (
            event.content
            and event.content.parts
            and _is_subagent_author(event.author or "")
        ):
            texts = _event_texts(event)
            for text in texts:
                for chunk in chunk_text(_format_agent_message(event.author, text)):
                    await self._send_reply(
                        message,
                        chunk,
                        parse_mode=ParseMode.MARKDOWN_V2,
                    )
        elif event.is_final_response() and event.content and event.content.parts:
            response_texts.extend(_event_texts(event))

    async def _session_lock_for(self, session_id: str) -> asyncio.Lock:
        """Return a stable :class:`asyncio.Lock` for ``session_id``."""
        async with self._session_locks_guard:
            lock = self._session_locks.get(session_id)
            if lock is None:
                lock = asyncio.Lock()
                self._session_locks[session_id] = lock
            return lock

    async def _nudge_login(self, message: TelegramMessage) -> None:
        """One-time ``/login`` nudge for an unlinked sender (DM first, fallback reply)."""
        if message.user_id in self._nudged_users:
            return
        self._nudged_users.add(message.user_id)
        url = await self.auth.build_login_url(
            telegram_user_id=message.user_id,
            telegram_chat_id=message.chat_id,
        )
        if url is None:
            return
        text = f"To link this Telegram account, sign in here:\n{url}"
        bot = self.application.bot
        if message.chat_type == "private":
            try:
                await bot.send_message(chat_id=message.user_id, text=text)
                return
            except Forbidden:
                log.debug(
                    "Bot cannot DM private chat user %s; falling back", message.user_id
                )
            except Exception:
                log.exception("Failed to send login nudge via bot.send_message")
            await self._send_text(message, text)
            return
        try:
            await bot.send_message(chat_id=message.user_id, text=text)
        except Forbidden:
            await self._send_text(message, text)
        except Exception:
            log.exception("Failed to send login nudge DM")
            await self._send_text(message, text)

    # ----- command handlers ------------------------------------------------

    async def _on_help(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        message = telegram_message_from_update(update)
        if message is not None and self._is_allowed(message):
            await self.send_help(message)

    async def send_help(self, message: TelegramMessage) -> None:
        reply_markup: InlineKeyboardMarkup | None = None
        if self.mini_app_url:
            reply_markup = InlineKeyboardMarkup(
                [
                    [
                        InlineKeyboardButton(
                            "Open App", web_app=WebAppInfo(url=self.mini_app_url)
                        )
                    ]
                ]
            )
        await self._send_text(message, help_text(), reply_markup=reply_markup)

    async def _on_login(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        message = telegram_message_from_update(update)
        if message is not None and self._is_allowed(message):
            await self.send_login_link(message)

    async def send_login_link(self, message: TelegramMessage) -> None:
        url = await self.auth.build_login_url(
            telegram_user_id=message.user_id,
            telegram_chat_id=message.chat_id,
        )
        if url is None:
            await self._send_text(
                message,
                "Telegram login is not configured. Set TELEGRAM_LINK_BASE_URL.",
            )
            return
        await self._send_text(
            message,
            "Sign in to connect this Telegram chat to your account:\n" + url,
        )

    async def _on_logout(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        message = telegram_message_from_update(update)
        if message is None or not self._is_allowed(message):
            return
        unlinked = await self.auth.unlink(message.user_id)
        text = (
            "Telegram access has been unlinked."
            if unlinked
            else "No linked account was found."
        )
        await self._send_text(message, text)

    async def _on_reset(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        message = telegram_message_from_update(update)
        if message is not None and self._is_allowed(message):
            await self._reset_session(message)

    async def _on_stop(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        message = telegram_message_from_update(update)
        if message is None or not self._is_allowed(message):
            return
        session_id = _session_id(message)
        async with self._session_tasks_guard:
            task = self._session_tasks.get(session_id)
        if task is None or task.done():
            await self._send_text(
                message, f"Nothing in flight to stop for {ORCHESTRATOR_TITLE}."
            )
            return
        task.cancel()
        await self._send_text(message, f"Stopped {ORCHESTRATOR_TITLE} for this chat.")

    async def _on_chat_id(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        message = telegram_message_from_update(update)
        if message is not None and self._is_allowed(message):
            await self._send_text(message, chat_id_text(message))

    async def _on_unknown(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        message = telegram_message_from_update(update)
        if message is not None and self._is_allowed(message):
            await self._send_text(message, "Unknown command. Use /help.")

    async def _on_text(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        message = telegram_message_from_update(update)
        if message is not None:
            await self.handle_message(message)

    async def _on_error(
        self,
        update: object,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        del update
        if context.error is None:
            log.error("Telegram handler failed")
            return
        log.exception(
            "Telegram handler failed",
            exc_info=(
                type(context.error),
                context.error,
                context.error.__traceback__,
            ),
        )

    # ----- auth/session helpers --------------------------------------------

    async def _reset_session(self, message: TelegramMessage) -> None:
        clerk_user_id = await self.auth.linked_user_id(message.user_id)
        partition_user_id = _partition_user_id(message, clerk_user_id)
        await _reset_session(
            self.session_service,
            message=message,
            partition_user_id=partition_user_id,
        )
        await self._send_text(message, f"Reset {ORCHESTRATOR_TITLE} for this chat.")

    # ----- message helpers -------------------------------------------------

    def _is_allowed(self, message: TelegramMessage) -> bool:
        if self.allowed_chat_ids and message.chat_id not in self.allowed_chat_ids:
            if self.debug:
                log.info("Ignoring unauthorized Telegram chat %s", message.chat_id)
            return False
        return True

    async def _send_markdown(self, message: TelegramMessage, text: str) -> None:
        escaped = _escape_markdownv2(text) if text else _escape_markdownv2("Done.")
        chunks = chunk_text(escaped)
        await self._send_reply(message, chunks[0], parse_mode=ParseMode.MARKDOWN_V2)
        for chunk in chunks[1:]:
            await self._send_reply(message, chunk, parse_mode=ParseMode.MARKDOWN_V2)

    async def _send_text(
        self,
        message: TelegramMessage,
        text: str,
        reply_markup: InlineKeyboardMarkup | None = None,
    ) -> None:
        await send_text_chunks(message, text, reply_markup)

    async def _send_reply(
        self,
        message: TelegramMessage,
        text: str,
        reply_markup: InlineKeyboardMarkup | None = None,
        *,
        parse_mode: str | None = None,
    ) -> TelegramSentMessage | None:
        return await send_reply(message, text, reply_markup, parse_mode=parse_mode)


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------


def telegram_message_from_update(update: Update) -> TelegramMessage | None:
    raw = update.effective_message
    chat = update.effective_chat
    sender = update.effective_user
    if raw is None or chat is None:
        return None
    text = raw.text
    if not text:
        return None
    sender_id = sender.id if sender is not None else chat.id
    user_name = _sender_display_name(sender, sender_id)
    reply_to_bot, reply_to_bot_username = _reply_to_bot(raw)
    return TelegramMessage(
        chat_id=chat.id,
        user_id=sender_id,
        text=text.strip(),
        message_id=raw.message_id,
        chat_type=chat.type,
        message_thread_id=raw.message_thread_id,
        is_topic_message=bool(raw.is_topic_message),
        reply_target=raw,
        user_name=user_name,
        reply_to_bot=reply_to_bot,
        reply_to_bot_username=reply_to_bot_username,
    )


def _sender_display_name(sender: User | None, sender_id: int) -> str | None:
    if sender is None:
        return None
    if sender.full_name:
        return sender.full_name.strip() or None
    if sender.username:
        return f"@{sender.username}"
    return str(sender_id)


def _reply_to_bot(raw: Message) -> tuple[bool, str | None]:
    reply = raw.reply_to_message
    if reply is None or reply.from_user is None:
        return False, None
    from_user = reply.from_user
    return from_user.is_bot, _normalize_bot_username(from_user.username)


def help_text() -> str:
    return (
        "ADK Telegram bot\n\n"
        f"Default agent: {ORCHESTRATOR_AGENT_ID} - {ORCHESTRATOR_TITLE}\n\n"
        "Commands:\n"
        "/help - show help and onboarding\n"
        "/login - link Telegram to your signed-in web account\n"
        "/logout - unlink Telegram from your web account\n"
        "/new - start a new conversation\n"
        "/reset - alias for /new\n"
        "/stop - cancel the in-flight run for this chat\n"
        "/chat_id - show this Telegram chat ID\n\n"
        "After linking, send normal messages to talk to the orchestrator."
    )


def chat_id_text(message: TelegramMessage) -> str:
    topic_id = _session_topic_id(message)
    if topic_id is None:
        return str(message.chat_id)
    return f"chat_id: {message.chat_id}\ntopic_id: {topic_id}"


def bot_commands() -> tuple[BotCommand, ...]:
    return (
        BotCommand("help", "Show help and onboarding"),
        BotCommand("login", "Link Telegram to your web account"),
        BotCommand("logout", "Unlink Telegram from your web account"),
        BotCommand("new", "Start a fresh AI conversation"),
        BotCommand("reset", "Reset the current conversation"),
        BotCommand("stop", "Cancel the in-flight run for this chat"),
        BotCommand("chat_id", "Show this chat ID"),
    )


def chunk_text(text: str) -> list[str]:
    if not text:
        return ["Done."]
    chunks: list[str] = []
    remaining = text
    while len(remaining) > TELEGRAM_MESSAGE_LIMIT:
        split_at = remaining.rfind("\n", 0, TELEGRAM_MESSAGE_LIMIT)
        if split_at < TELEGRAM_MESSAGE_LIMIT // 2:
            split_at = TELEGRAM_MESSAGE_LIMIT
        chunks.append(remaining[:split_at].rstrip())
        remaining = remaining[split_at:].lstrip()
    chunks.append(remaining)
    return chunks


async def send_text_chunks(
    message: TelegramMessage,
    text: str,
    reply_markup: InlineKeyboardMarkup | None = None,
    *,
    parse_mode: str | None = None,
) -> None:
    chunks = chunk_text(text)
    for i, chunk in enumerate(chunks):
        await send_reply(
            message,
            chunk,
            reply_markup=reply_markup if i == 0 else None,
            parse_mode=parse_mode,
        )


async def send_reply(
    message: TelegramMessage,
    text: str,
    reply_markup: InlineKeyboardMarkup | None = None,
    *,
    parse_mode: str | None = None,
) -> TelegramSentMessage | None:
    if message.reply_target is None:
        log.warning("Cannot reply to Telegram message without a reply target")
        return None
    try:
        return await message.reply_target.reply_text(
            text,
            disable_web_page_preview=True,
            reply_markup=reply_markup,
            parse_mode=parse_mode,
            message_thread_id=_session_topic_id(message),
        )
    except BadRequest as exc:
        if "Message to be replied not found" not in str(exc):
            raise
        log.warning(
            "Original Telegram message %s was deleted before reply; sending as a new message",
            message.message_id,
        )
        return await message.reply_target.get_bot().send_message(
            chat_id=message.chat_id,
            text=text,
            disable_web_page_preview=True,
            reply_markup=reply_markup,
            parse_mode=parse_mode,
            message_thread_id=_session_topic_id(message),
        )


def _dedupe_join(texts: list[str]) -> str:
    output: list[str] = []
    seen: set[str] = set()
    for text in texts:
        normalized = text.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        output.append(normalized)
    return "\n\n".join(output).strip()


def _event_texts(event: Event) -> list[str]:
    parts = event.content.parts if event.content else None
    if not parts:
        return []
    return [
        part.text.strip()
        for part in parts
        if part.text and getattr(part, "thought", None) is not True
    ]


def _is_subagent_author(author: str | None) -> bool:
    if not author:
        return False
    return author not in {
        ORCHESTRATOR_AGENT_ID,
        "telegram_orchestrator_agent",
    }


def _format_agent_message(author: str, text: str) -> str:
    label = _escape_markdownv2(_readable_agent_name(author))
    body = _escape_markdownv2(text)
    return f"*{label}:*\n{body}"


def _readable_agent_name(author: str) -> str:
    name = author.removesuffix("_agent")
    return _readable_tool_name(name).capitalize() + " agent"


def format_state_summary(state: Mapping[str, StateValue]) -> str:
    visible: list[str] = []
    for key, value in state.items():
        if _is_hidden_state_key(key) or _is_empty(value):
            continue
        rendered = _render_state_value(value)
        if rendered:
            visible.append(f"{key}: {rendered}")
        if len(visible) >= 6:
            break
    if not visible:
        return ""
    return f"{ORCHESTRATOR_TITLE} updated state:\n" + "\n".join(visible)


def _is_hidden_state_key(key: str) -> bool:
    return key in _HIDDEN_STATE_KEYS or key.startswith(_HIDDEN_STATE_PREFIXES)


def _is_empty(value: StateValue) -> bool:
    return value is None or value == "" or value == [] or value == {}


def _render_state_value(value: StateValue) -> str:
    if isinstance(value, str):
        return _truncate(value.replace("\n\n", "\n"), 900)
    if isinstance(value, bool | int | float):
        return str(value)
    if isinstance(value, list):
        items = _OBJECT_LIST.validate_python(value)
        preview = ", ".join(_truncate(str(item), 80) for item in items[:5])
        suffix = f" (+{len(items) - 5} more)" if len(items) > 5 else ""
        return _truncate(preview + suffix, 900)
    if isinstance(value, Mapping):
        mapping = _OBJECT_DICT.validate_python(value)
        entries = list(mapping.items())[:5]
        parts = [f"{k}={_truncate(str(v), 80)}" for k, v in entries]
        suffix = f" (+{len(mapping) - 5} more)" if len(mapping) > 5 else ""
        return _truncate(", ".join(parts) + suffix, 900)
    return _truncate(str(value), 900)


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def _readable_tool_name(name: str) -> str:
    return " ".join(name.replace("-", "_").split("_")).strip() or "tool"


def _escape_markdownv2(text: str) -> str:
    """Escape all MarkdownV2 special characters in a plain-text string."""
    return escape_markdown(text, version=2)


def _normalize_bot_username(value: str | None) -> str | None:
    if not value:
        return None
    return value.strip().removeprefix("@").lower() or None


def _is_unaddressed_group_message(
    message: TelegramMessage,
    bot_username: str | None,
) -> bool:
    if message.chat_type not in {"group", "supergroup"}:
        return False
    if (
        message.reply_to_bot
        and bot_username is not None
        and message.reply_to_bot_username == bot_username
    ):
        return False
    if bot_username is None:
        return True
    return f"@{bot_username}" not in message.text.lower()


def _agent_message_text(message: TelegramMessage, bot_username: str | None) -> str:
    text = message.text.strip()
    if message.chat_type in {"group", "supergroup"} and bot_username is not None:
        mention = f"@{bot_username}"
        words = [word for word in text.split() if word.lower() != mention]
        text = " ".join(words).strip() or text
    if _is_shared_topic_session(message) and message.user_name:
        text = f"{message.user_name}: {text}"
    return text


def _session_topic_id(message: TelegramMessage) -> int | None:
    if message.chat_type not in {"group", "supergroup"}:
        return None
    if not message.is_topic_message:
        return None
    return message.message_thread_id


def _default_connect_url(link_base_url: str | None) -> str | None:
    if not link_base_url:
        return None
    return link_base_url.split("/telegram/link", 1)[0].rstrip("/") + "/console/settings"


def _float_env(name: str, default: float | None) -> float | None:
    value = os.getenv(name)
    if not value:
        return default
    try:
        parsed = float(value)
    except ValueError:
        log.warning("Ignoring invalid %s=%r; using %r", name, value, default)
        return default
    if parsed <= 0:
        return None
    return parsed


# ---------------------------------------------------------------------------
# Factories
# ---------------------------------------------------------------------------


def build_application(
    token: str,
) -> TelegramApplication:
    """Build a :class:`telegram.ext.Application` for the given BotFather token."""
    builder = cast(_TelegramApplicationBuilder, ApplicationBuilder())
    return builder.token(token).post_init(_set_bot_commands).build()


async def _set_bot_commands(
    application: TelegramApplication,
) -> None:
    await application.bot.set_my_commands(bot_commands())


def build_orchestrator_runner(services: AgentServices) -> Runner:
    """Wrap the orchestrator agent in an ADK :class:`Runner`."""
    return Runner(
        app=App(
            name=ORCHESTRATOR_AGENT_ID,
            root_agent=build_orchestrator_agent(),
            plugins=[SlimMcpPlugin()],
            events_compaction_config=EventsCompactionConfig(
                compaction_interval=ORCHESTRATOR_COMPACTION_INTERVAL,
                overlap_size=ORCHESTRATOR_COMPACTION_OVERLAP_SIZE,
                token_threshold=ORCHESTRATOR_COMPACTION_TOKEN_THRESHOLD,
                event_retention_size=ORCHESTRATOR_COMPACTION_EVENT_RETENTION_SIZE,
                summarizer=LlmEventSummarizer(
                    llm=LiteLlm(model=TELEGRAM_ORCHESTRATOR_MODEL),
                ),
            ),
        ),
        app_name=ORCHESTRATOR_AGENT_ID,
        artifact_service=services.artifact_service,
        session_service=services.session_service,
        memory_service=services.memory_service,
        credential_service=services.credential_service,
        auto_create_session=False,
    )


def build_telegram_runner(
    *,
    token: str,
    services: AgentServices | None = None,
    allowed_chat_ids: set[int] | None = None,
    link_base_url: str | None = None,
    connect_url: str | None = None,
    mini_app_url: str | None = None,
    bot_username: str | None = None,
    credential_loader: CredentialLoader | None = None,
    debug: bool = False,
    run_timeout_seconds: float | None = None,
) -> TelegramRunner:
    """Compose a :class:`TelegramRunner` with all of its dependencies wired up."""
    services = services or create_agent_services()
    application = build_application(token)
    runner = build_orchestrator_runner(services)
    auth = TelegramAuth(engine=services.engine, link_base_url=link_base_url)
    credentials = CredentialGate(
        connect_url=connect_url or _default_connect_url(link_base_url),
        loader=credential_loader,
    )
    return TelegramRunner(
        runner=runner,
        application=application,
        session_service=services.session_service,
        auth=auth,
        credentials=credentials,
        allowed_chat_ids=allowed_chat_ids,
        mini_app_url=mini_app_url,
        bot_username=bot_username or os.getenv("TELEGRAM_BOT_USERNAME"),
        debug=debug,
        run_timeout_seconds=(
            run_timeout_seconds
            if run_timeout_seconds is not None
            else _float_env("TELEGRAM_RUN_TIMEOUT_SECONDS", None)
        ),
    )


def parse_allowed_chat_ids(value: str | None) -> set[int]:
    if not value:
        return set()
    chat_ids: set[int] = set()
    for item in value.split(","):
        item = item.strip()
        if item:
            chat_ids.add(int(item))
    return chat_ids


def env_flag(name: str, *, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}
