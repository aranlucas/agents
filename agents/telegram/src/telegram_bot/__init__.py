"""Telegram channel adapter for the agents monorepo."""

from .agent_registry import TELEGRAM_AGENTS, TelegramAgentSpec
from .orchestrator import ORCHESTRATOR_AGENT_ID, build_orchestrator_agent
from .runner import TelegramRunner, build_telegram_runner

__all__ = [
    "ORCHESTRATOR_AGENT_ID",
    "TELEGRAM_AGENTS",
    "TelegramAgentSpec",
    "TelegramRunner",
    "build_orchestrator_agent",
    "build_telegram_runner",
]
