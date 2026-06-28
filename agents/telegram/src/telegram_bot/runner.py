"""Telegram Bot API runner for the surfaced ADK agents."""

from __future__ import annotations

import logging
import os
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Any, Protocol, cast
from urllib.parse import urlencode

from agents_shared.dependencies import AgentServices, create_agent_services
from agents_shared.plugins import SlimMcpPlugin
from agents_shared.telegram_auth import (
    create_link_token,
    get_linked_clerk_user_id,
    telegram_credential_state,
    unlink_telegram_user,
)
from google.adk.agents import BaseAgent
from google.adk.runners import Runner
from google.genai import types
from telegram import Update
from telegram.ext import (
    Application,
    ApplicationBuilder,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from .agent_registry import TELEGRAM_AGENT_BY_ID, TELEGRAM_AGENTS, TelegramAgentSpec
from .orchestrator import ORCHESTRATOR_AGENT_ID

log = logging.getLogger(__name__)

TELEGRAM_MESSAGE_LIMIT = 4096
_HIDDEN_STATE_PREFIXES = ("temp:", "_")
_HIDDEN_STATE_KEYS = {
    "user_id",
    "telegram_chat_id",
    "telegram_user_id",
    "interests",
}


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
    ) -> TelegramSentMessage: ...


@dataclass
class TelegramMessage:
    chat_id: int
    user_id: int
    text: str
    message_id: int | None = None
    chat_type: str = "private"
    reply_target: TelegramReplyTarget | None = None


@dataclass
class _AgentRuntime:
    spec: TelegramAgentSpec
    runner: Runner


class TelegramAgentsBot:
    """Long-polling Telegram adapter for all surfaced ADK agents."""

    def __init__(
        self,
        *,
        services: AgentServices | None = None,
        allowed_chat_ids: set[int] | None = None,
        link_base_url: str | None = None,
        connect_url: str | None = None,
        credential_state_loader: Callable[
            [str], Awaitable[tuple[dict[str, object], tuple[str, ...]]]
        ]
        | None = None,
        poll_timeout: int = 50,
        debug: bool = False,
    ) -> None:
        self.services = services or create_agent_services()
        self.default_agent_id = ORCHESTRATOR_AGENT_ID
        self.allowed_chat_ids = allowed_chat_ids or set()
        self.link_base_url = link_base_url
        self.connect_url = connect_url or _default_connect_url(link_base_url)
        self.credential_state_loader = credential_state_loader
        self.poll_timeout = poll_timeout
        self.debug = debug
        self._selected_agent_by_chat: dict[int, str] = {}
        self._runtimes: dict[str, _AgentRuntime] = {}

    def build_application(
        self, token: str
    ) -> Application[Any, Any, Any, Any, Any, Any]:
        application = ApplicationBuilder().token(token).build()
        application.add_handler(CommandHandler(["start", "help"], self._help_update))
        application.add_handler(CommandHandler("login", self._login_update))
        application.add_handler(
            CommandHandler(["logout", "unlink"], self._logout_update)
        )
        application.add_handler(CommandHandler("agents", self._agents_update))
        application.add_handler(CommandHandler("agent", self._agent_update))
        application.add_handler(CommandHandler("current", self._current_update))
        application.add_handler(CommandHandler("reset", self._reset_update))
        application.add_handler(CommandHandler("chat_id", self._chat_id_update))
        application.add_handler(MessageHandler(filters.COMMAND, self._unknown_update))
        application.add_handler(
            MessageHandler(filters.TEXT & ~filters.COMMAND, self._message_update)
        )
        application.add_error_handler(self._error_update)
        return application

    def run_polling(self, token: str) -> None:
        log.info("Telegram agents bot polling started")
        self.build_application(token).run_polling(
            timeout=self.poll_timeout,
            allowed_updates=["message"],
        )

    async def handle_message(self, message: TelegramMessage) -> None:
        if not self._is_allowed(message):
            return

        agent_id = self._selected_agent_by_chat.get(
            message.chat_id, self.default_agent_id
        )
        await self._run_agent(message, agent_id)

    async def _help_update(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        del context
        message = telegram_message_from_update(update)
        if message is not None and self._is_allowed(message):
            await self._send_chunks(message, help_text())

    async def _login_update(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        del context
        message = telegram_message_from_update(update)
        if message is not None and self._is_allowed(message):
            await self.send_login_link(message)

    async def _logout_update(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        del context
        message = telegram_message_from_update(update)
        if message is not None and self._is_allowed(message):
            await self._unlink(message)

    async def _agents_update(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        del context
        message = telegram_message_from_update(update)
        if message is not None and self._is_allowed(message):
            await self._send_chunks(message, agents_text())

    async def _agent_update(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        message = telegram_message_from_update(update)
        if message is not None and self._is_allowed(message):
            await self._select_agent(message, " ".join(context.args or []))

    async def _current_update(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        del context
        message = telegram_message_from_update(update)
        if message is None or not self._is_allowed(message):
            return
        agent_id = self._selected_agent_by_chat.get(
            message.chat_id, self.default_agent_id
        )
        spec = TELEGRAM_AGENT_BY_ID[agent_id]
        await self._send_chunks(
            message,
            f"Current agent: {spec.id} - {spec.title}\n{spec.description}",
        )

    async def _reset_update(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        del context
        message = telegram_message_from_update(update)
        if message is not None and self._is_allowed(message):
            await self._reset_session(message)

    async def _chat_id_update(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        del context
        message = telegram_message_from_update(update)
        if message is not None and self._is_allowed(message):
            await self._send_chunks(message, str(message.chat_id))

    async def _unknown_update(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        del context
        message = telegram_message_from_update(update)
        if message is not None and self._is_allowed(message):
            await self._send_chunks(message, "Unknown command. Use /help.")

    async def _message_update(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
    ) -> None:
        del context
        message = telegram_message_from_update(update)
        if message is not None:
            await self.handle_message(message)

    async def _error_update(
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

    def _is_allowed(self, message: TelegramMessage) -> bool:
        if self.allowed_chat_ids and message.chat_id not in self.allowed_chat_ids:
            if self.debug:
                log.info("Ignoring unauthorized Telegram chat %s", message.chat_id)
            return False
        return True

    async def _select_agent(self, message: TelegramMessage, raw_agent_id: str) -> None:
        agent_id = raw_agent_id.strip()
        if not agent_id:
            await self._send_chunks(message, agents_text())
            return
        if agent_id not in TELEGRAM_AGENT_BY_ID:
            await self._send_chunks(
                message,
                f"Unknown agent '{agent_id}'.\n\n{agents_text()}",
            )
            return
        self._selected_agent_by_chat[message.chat_id] = agent_id
        spec = TELEGRAM_AGENT_BY_ID[agent_id]
        await self._send_chunks(
            message,
            f"Switched to {spec.title}. Send a message to talk to {spec.id}.",
        )

    async def _reset_session(self, message: TelegramMessage) -> None:
        clerk_user_id = await self._linked_clerk_user_id(message)
        if clerk_user_id is None:
            await self._send_login_required(message)
            return
        agent_id = self._selected_agent_by_chat.get(
            message.chat_id, self.default_agent_id
        )
        spec = TELEGRAM_AGENT_BY_ID[agent_id]
        await self.services.session_service.delete_session(
            app_name=spec.id,
            user_id=clerk_user_id,
            session_id=_session_id(message, spec.id),
        )
        await self._ensure_session(
            message=message,
            spec=spec,
            clerk_user_id=clerk_user_id,
            initial_state={"user_id": clerk_user_id},
        )
        await self._send_chunks(message, f"Reset {spec.title} for this chat.")

    async def _run_agent(self, message: TelegramMessage, agent_id: str) -> None:
        spec = TELEGRAM_AGENT_BY_ID[agent_id]

        clerk_user_id = await self._linked_clerk_user_id(message)
        if clerk_user_id is None:
            await self._send_login_required(message)
            return

        credential_state, missing = await self._credential_state(clerk_user_id)
        if missing:
            await self._send_chunks(
                message,
                _connect_required_text(missing, self.connect_url),
            )
            return

        runtime = self._get_runtime(spec)

        await self._ensure_session(
            message=message,
            spec=spec,
            clerk_user_id=clerk_user_id,
            initial_state=credential_state,
        )

        thinking_message = await self._send_reply(message, "Thinking...")

        response_texts: list[str] = []
        state_delta: dict[str, Any] = {}
        try:
            new_message = types.Content(
                role="user",
                parts=[types.Part(text=message.text)],
            )
            async for event in runtime.runner.run_async(
                user_id=clerk_user_id,
                session_id=_session_id(message, spec.id),
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
                text = await self._state_summary(
                    spec,
                    message,
                    clerk_user_id,
                    {**credential_state, **state_delta},
                )
            if not text:
                text = "Done."
            await self._replace_thinking(
                message=message,
                thinking_message=thinking_message,
                text=text,
            )
        except Exception as exc:
            log.exception("Telegram agent run failed for %s", spec.id)
            await self._replace_thinking(
                message=message,
                thinking_message=thinking_message,
                text=f"Sorry, {spec.title} hit an error: {exc}",
            )

    def _get_runtime(self, spec: TelegramAgentSpec) -> _AgentRuntime:
        runtime = self._runtimes.get(spec.id)
        if runtime is not None:
            return runtime

        root = spec.build()
        runner_kwargs: dict[str, Any] = {
            "app_name": spec.id,
            "plugins": [SlimMcpPlugin()],
            "artifact_service": self.services.artifact_service,
            "session_service": self.services.session_service,
            "memory_service": self.services.memory_service,
            "credential_service": self.services.credential_service,
            "auto_create_session": False,
        }
        if isinstance(root, BaseAgent):
            runner = Runner(agent=root, **runner_kwargs)
        else:
            runner = Runner(node=root, **runner_kwargs)
        runtime = _AgentRuntime(spec=spec, runner=runner)
        self._runtimes[spec.id] = runtime
        return runtime

    async def _ensure_session(
        self,
        *,
        message: TelegramMessage,
        spec: TelegramAgentSpec,
        clerk_user_id: str,
        initial_state: Mapping[str, object],
    ) -> None:
        session = await self.services.session_service.get_session(
            app_name=spec.id,
            user_id=clerk_user_id,
            session_id=_session_id(message, spec.id),
        )
        if session is None:
            await self.services.session_service.create_session(
                app_name=spec.id,
                user_id=clerk_user_id,
                session_id=_session_id(message, spec.id),
                state={
                    **initial_state,
                    "telegram_chat_id": str(message.chat_id),
                    "telegram_user_id": str(message.user_id),
                    "user_id": clerk_user_id,
                },
            )

    async def _state_summary(
        self,
        spec: TelegramAgentSpec,
        message: TelegramMessage,
        clerk_user_id: str,
        state_delta: Mapping[str, Any],
    ) -> str:
        session = await self.services.session_service.get_session(
            app_name=spec.id,
            user_id=clerk_user_id,
            session_id=_session_id(message, spec.id),
        )
        state = dict(session.state) if session is not None else {}
        state.update(state_delta)
        return format_state_summary(spec, state)

    async def send_login_link(self, message: TelegramMessage) -> None:
        if not self.link_base_url:
            await self._send_chunks(
                message,
                "Telegram login is not configured. Set TELEGRAM_LINK_BASE_URL.",
            )
            return
        token = await create_link_token(
            self.services.engine,
            telegram_user_id=str(message.user_id),
            telegram_chat_id=str(message.chat_id),
        )
        url = _url_with_token(self.link_base_url, token)
        await self._send_chunks(
            message,
            "Sign in to connect this Telegram chat to your account:\n" + url,
        )

    async def _send_login_required(self, message: TelegramMessage) -> None:
        await self._send_chunks(
            message,
            "Sign in is required before I can use your Strava and QFC credentials. "
            "Send /login to link this Telegram account.",
        )

    async def _unlink(self, message: TelegramMessage) -> None:
        unlinked = await unlink_telegram_user(
            self.services.engine,
            telegram_user_id=str(message.user_id),
        )
        if unlinked:
            await self._send_chunks(message, "Telegram access has been unlinked.")
        else:
            await self._send_chunks(message, "No linked account was found.")

    async def _linked_clerk_user_id(self, message: TelegramMessage) -> str | None:
        return await get_linked_clerk_user_id(
            self.services.engine,
            telegram_user_id=str(message.user_id),
        )

    async def _credential_state(
        self,
        clerk_user_id: str,
    ) -> tuple[dict[str, object], tuple[str, ...]]:
        if self.credential_state_loader is not None:
            return await self.credential_state_loader(clerk_user_id)
        credential_state = await telegram_credential_state(clerk_user_id)
        return credential_state.state, credential_state.missing

    async def _replace_thinking(
        self,
        *,
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

    async def _send_chunks(self, message: TelegramMessage, text: str) -> None:
        for chunk in chunk_text(text):
            await self._send_reply(message, chunk)

    async def _send_reply(
        self,
        message: TelegramMessage,
        text: str,
    ) -> TelegramSentMessage | None:
        if message.reply_target is None:
            log.warning("Cannot reply to Telegram message without a reply target")
            return None
        return await message.reply_target.reply_text(
            text,
            disable_web_page_preview=True,
        )


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
        f"Default agent: {ORCHESTRATOR_AGENT_ID}\n\n"
        "Commands:\n"
        "/login - link Telegram to your signed-in web account\n"
        "/logout - unlink Telegram from your web account\n"
        "/agents - list available agents\n"
        "/agent <id> - switch the active agent for this chat\n"
        "/current - show the selected agent\n"
        "/reset - reset the selected agent session\n"
        "/chat_id - show this Telegram chat ID\n\n"
        "After selecting an agent, send normal messages to talk to it."
    )


def agents_text() -> str:
    lines = ["Available agents:"]
    for spec in TELEGRAM_AGENTS:
        lines.append(f"/agent {spec.id} - {spec.title}: {spec.description}")
    return "\n".join(lines)


def _session_id(message: TelegramMessage, agent_id: str) -> str:
    return f"telegram:{message.chat_id}:{agent_id}"


def _url_with_token(base_url: str, token: str) -> str:
    separator = "&" if "?" in base_url else "?"
    return f"{base_url}{separator}{urlencode({'token': token})}"


def _default_connect_url(link_base_url: str | None) -> str | None:
    if not link_base_url:
        return None
    return link_base_url.split("/telegram/link", 1)[0].rstrip("/") + "/console/settings"


def _connect_required_text(missing: tuple[str, ...], connect_url: str | None) -> str:
    providers = ", ".join(missing)
    text = f"Your account is linked, but {providers} is not connected yet."
    if connect_url:
        return text + f"\nConnect it here: {connect_url}"
    return text + "\nOpen the web app settings page to connect it, then try again."


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


def format_state_summary(spec: TelegramAgentSpec, state: Mapping[str, Any]) -> str:
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
    return f"{spec.title} updated state:\n" + "\n".join(visible)


def _is_hidden_state_key(key: str) -> bool:
    return key in _HIDDEN_STATE_KEYS or key.startswith(_HIDDEN_STATE_PREFIXES)


def _is_empty(value: Any) -> bool:
    return value is None or value == "" or value == [] or value == {}


def _render_state_value(value: Any) -> str:
    if isinstance(value, str):
        return _truncate(value.replace("\n\n", "\n"), 900)
    if isinstance(value, bool | int | float):
        return str(value)
    if isinstance(value, list):
        preview = ", ".join(_truncate(str(item), 80) for item in value[:5])
        suffix = f" (+{len(value) - 5} more)" if len(value) > 5 else ""
        return _truncate(preview + suffix, 900)
    if isinstance(value, Mapping):
        parts = [f"{k}={_truncate(str(v), 80)}" for k, v in list(value.items())[:5]]
        suffix = f" (+{len(value) - 5} more)" if len(value) > 5 else ""
        return _truncate(", ".join(parts) + suffix, 900)
    return _truncate(str(value), 900)


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


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
