"""Telegram Bot API runner for the orchestrator ADK agent.

Mirrors ``google.adk.integrations.slack.SlackRunner`` — a thin wrapper that
bridges a :class:`telegram.ext.Application` with an ADK :class:`Runner`. The
Telegram-specific auth, credential, and session concerns are factored out into
small :class:`TelegramAuth`, :class:`CredentialGate`, and
:class:`SessionManager` dependencies so the runner stays focused on the
``receive message → run agent → edit thinking message`` loop.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Awaitable, Callable, Iterable, Mapping
from dataclasses import dataclass
from typing import Protocol, cast
from urllib.parse import urlencode

from agents_shared.dependencies import AgentServices, create_agent_services
from agents_shared.plugins import SlimMcpPlugin
from agents_shared.telegram_auth import (
    create_link_token,
    get_linked_clerk_user_id,
    telegram_credential_state,
    unlink_telegram_user,
)
from google.adk.runners import Runner
from google.adk.sessions import BaseSessionService
from google.genai import types
from sqlalchemy.ext.asyncio import AsyncEngine
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update, WebAppInfo
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

from .orchestrator import (
    ORCHESTRATOR_AGENT_ID,
    ORCHESTRATOR_TITLE,
    build_orchestrator_agent,
)

log = logging.getLogger(__name__)

TELEGRAM_MESSAGE_LIMIT = 4096
_HIDDEN_STATE_PREFIXES = ("temp:", "_")
_HIDDEN_STATE_KEYS = frozenset(
    {
        "user_id",
        "telegram_chat_id",
        "telegram_user_id",
        "interests",
    }
)
StateValue = object
CredentialState = tuple[dict[str, StateValue], tuple[str, ...]]
CredentialLoader = Callable[[str], Awaitable[CredentialState]]


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


class TelegramSentMessage(Protocol):
    async def edit_text(
        self,
        text: str,
        *,
        disable_web_page_preview: bool = True,
    ) -> object: ...


class TelegramReplyTarget(Protocol):
    async def reply_text(
        self,
        text: str,
        *,
        disable_web_page_preview: bool = True,
        reply_markup: InlineKeyboardMarkup | None = None,
    ) -> TelegramSentMessage: ...


@dataclass(frozen=True)
class TelegramMessage:
    chat_id: int
    user_id: int
    text: str
    message_id: int | None = None
    chat_type: str = "private"
    reply_target: TelegramReplyTarget | None = None


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
        return await unlink_telegram_user(
            self.engine,
            telegram_user_id=str(telegram_user_id),
        )


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


_LOGIN_REQUIRED_TEXT = (
    "Sign in is required before I can use your Strava and QFC credentials. "
    "Send /login to link this Telegram account."
)


def _session_id(message: TelegramMessage) -> str:
    return f"telegram:{message.chat_id}:{ORCHESTRATOR_AGENT_ID}"


async def _ensure_session(
    session_service: BaseSessionService,
    *,
    message: TelegramMessage,
    clerk_user_id: str,
    initial_state: Mapping[str, StateValue],
) -> None:
    session_id = _session_id(message)
    session = await session_service.get_session(
        app_name=ORCHESTRATOR_AGENT_ID,
        user_id=clerk_user_id,
        session_id=session_id,
    )
    if session is None:
        await session_service.create_session(
            app_name=ORCHESTRATOR_AGENT_ID,
            user_id=clerk_user_id,
            session_id=session_id,
            state={
                **initial_state,
                "telegram_chat_id": str(message.chat_id),
                "telegram_user_id": str(message.user_id),
                "user_id": clerk_user_id,
            },
        )


async def _reset_session(
    session_service: BaseSessionService,
    *,
    message: TelegramMessage,
    clerk_user_id: str,
) -> None:
    await session_service.delete_session(
        app_name=ORCHESTRATOR_AGENT_ID,
        user_id=clerk_user_id,
        session_id=_session_id(message),
    )
    await _ensure_session(
        session_service,
        message=message,
        clerk_user_id=clerk_user_id,
        initial_state={"user_id": clerk_user_id},
    )


async def _state_summary(
    session_service: BaseSessionService,
    *,
    message: TelegramMessage,
    clerk_user_id: str,
    delta: Mapping[str, StateValue],
) -> str:
    session = await session_service.get_session(
        app_name=ORCHESTRATOR_AGENT_ID,
        user_id=clerk_user_id,
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
        application: Application[
            ExtBot[None],
            ContextTypes.DEFAULT_TYPE,
            dict[str, object],
            dict[str, object],
            dict[str, object],
            JobQueue[ContextTypes.DEFAULT_TYPE],
        ],
        session_service: BaseSessionService,
        auth: TelegramAuth,
        credentials: CredentialGate,
        allowed_chat_ids: set[int] | None = None,
        mini_app_url: str | None = None,
        debug: bool = False,
    ) -> None:
        self.runner = runner
        self.application = application
        self.session_service = session_service
        self.auth = auth
        self.credentials = credentials
        self.allowed_chat_ids = frozenset(allowed_chat_ids or set())
        self.mini_app_url = mini_app_url
        self.debug = debug
        self._setup_handlers()

    def _setup_handlers(self) -> None:
        self.application.add_handler(CommandHandler(["start", "help"], self._on_help))
        self.application.add_handler(CommandHandler("login", self._on_login))
        self.application.add_handler(
            CommandHandler(["logout", "unlink"], self._on_logout)
        )
        self.application.add_handler(CommandHandler(["reset", "new"], self._on_reset))
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

        clerk_user_id = await self.auth.linked_user_id(message.user_id)
        if clerk_user_id is None:
            await self._send_text(message, _LOGIN_REQUIRED_TEXT)
            return

        credential_state, missing = await self.credentials.check(clerk_user_id)
        if missing:
            await self._send_text(
                message,
                CredentialGate.format_missing(missing, self.credentials.connect_url),
            )
            return

        await _ensure_session(
            self.session_service,
            message=message,
            clerk_user_id=clerk_user_id,
            initial_state=credential_state,
        )

        thinking_message = await self._send_reply(message, "Thinking...")

        response_texts: list[str] = []
        state_delta: dict[str, StateValue] = {}
        try:
            new_message = types.Content(
                role="user",
                parts=[types.Part(text=message.text)],
            )
            async for event in self.runner.run_async(
                user_id=clerk_user_id,
                session_id=_session_id(message),
                new_message=new_message,
                state_delta={
                    **credential_state,
                    "telegram_chat_id": str(message.chat_id),
                    "telegram_user_id": str(message.user_id),
                },
            ):
                if event.actions and event.actions.state_delta:
                    state_delta.update(event.actions.state_delta)
                if event.error_message:
                    raise RuntimeError(event.error_message)
                if event.is_final_response() and event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.text:
                            response_texts.append(part.text.strip())

            text = _dedupe_join(response_texts)
            if not text:
                text = await _state_summary(
                    self.session_service,
                    message=message,
                    clerk_user_id=clerk_user_id,
                    delta={**credential_state, **state_delta},
                )
            if not text:
                text = "Done."
            await self._replace_thinking(message, thinking_message, text)
        except Exception as exc:
            log.exception("Telegram agent run failed for %s", ORCHESTRATOR_AGENT_ID)
            await self._replace_thinking(
                message,
                thinking_message,
                f"Sorry, {ORCHESTRATOR_TITLE} hit an error: {exc}",
            )

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

    async def _on_chat_id(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        message = telegram_message_from_update(update)
        if message is not None and self._is_allowed(message):
            await self._send_text(message, str(message.chat_id))

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
        if clerk_user_id is None:
            await self._send_text(message, _LOGIN_REQUIRED_TEXT)
            return
        await _reset_session(
            self.session_service,
            message=message,
            clerk_user_id=clerk_user_id,
        )
        await self._send_text(message, f"Reset {ORCHESTRATOR_TITLE} for this chat.")

    # ----- message helpers -------------------------------------------------

    def _is_allowed(self, message: TelegramMessage) -> bool:
        if self.allowed_chat_ids and message.chat_id not in self.allowed_chat_ids:
            if self.debug:
                log.info("Ignoring unauthorized Telegram chat %s", message.chat_id)
            return False
        return True

    async def _replace_thinking(
        self,
        message: TelegramMessage,
        thinking_message: TelegramSentMessage | None,
        text: str,
    ) -> None:
        chunks = chunk_text(text)
        first = chunks[0] if chunks else "Done."
        if thinking_message is not None:
            try:
                await thinking_message.edit_text(first, disable_web_page_preview=True)
            except Exception:
                log.exception("Failed to edit Telegram thinking message")
                await self._send_reply(message, first)
        else:
            await self._send_reply(message, first)
        for chunk in chunks[1:]:
            await self._send_reply(message, chunk)

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
    ) -> TelegramSentMessage | None:
        return await send_reply(message, text, reply_markup)


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
    return TelegramMessage(
        chat_id=chat.id,
        user_id=sender_id,
        text=text.strip(),
        message_id=raw.message_id,
        chat_type=chat.type,
        reply_target=cast(TelegramReplyTarget, raw),
    )


def help_text() -> str:
    return (
        "ADK Telegram bot\n\n"
        f"Default agent: {ORCHESTRATOR_AGENT_ID} - {ORCHESTRATOR_TITLE}\n\n"
        "Commands:\n"
        "/login - link Telegram to your signed-in web account\n"
        "/logout - unlink Telegram from your web account\n"
        "/new - start a new conversation\n"
        "/reset - alias for /new\n"
        "/chat_id - show this Telegram chat ID\n\n"
        "After linking, send normal messages to talk to the orchestrator."
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
) -> None:
    chunks = chunk_text(text)
    for i, chunk in enumerate(chunks):
        await send_reply(
            message,
            chunk,
            reply_markup=reply_markup if i == 0 else None,
        )


async def send_reply(
    message: TelegramMessage,
    text: str,
    reply_markup: InlineKeyboardMarkup | None = None,
) -> TelegramSentMessage | None:
    if message.reply_target is None:
        log.warning("Cannot reply to Telegram message without a reply target")
        return None
    return await message.reply_target.reply_text(
        text,
        disable_web_page_preview=True,
        reply_markup=reply_markup,
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
        items = cast("list[StateValue]", value)
        preview = ", ".join(_truncate(str(item), 80) for item in items[:5])
        suffix = f" (+{len(items) - 5} more)" if len(items) > 5 else ""
        return _truncate(preview + suffix, 900)
    if isinstance(value, Mapping):
        mapping = cast("Mapping[str, StateValue]", value)
        entries = list(mapping.items())[:5]
        parts = [f"{k}={_truncate(str(v), 80)}" for k, v in entries]
        suffix = f" (+{len(mapping) - 5} more)" if len(mapping) > 5 else ""
        return _truncate(", ".join(parts) + suffix, 900)
    return _truncate(str(value), 900)


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def _default_connect_url(link_base_url: str | None) -> str | None:
    if not link_base_url:
        return None
    return link_base_url.split("/telegram/link", 1)[0].rstrip("/") + "/console/settings"


# ---------------------------------------------------------------------------
# Factories
# ---------------------------------------------------------------------------


def build_application(
    token: str,
) -> Application[
    ExtBot[None],
    ContextTypes.DEFAULT_TYPE,
    dict[str, object],
    dict[str, object],
    dict[str, object],
    JobQueue[ContextTypes.DEFAULT_TYPE],
]:
    """Build a :class:`telegram.ext.Application` for the given BotFather token."""
    return ApplicationBuilder().token(token).build()


def build_orchestrator_runner(services: AgentServices) -> Runner:
    """Wrap the orchestrator agent in an ADK :class:`Runner`."""
    return Runner(
        agent=build_orchestrator_agent(),
        app_name=ORCHESTRATOR_AGENT_ID,
        plugins=[SlimMcpPlugin()],
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
    credential_loader: CredentialLoader | None = None,
    debug: bool = False,
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
        debug=debug,
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
