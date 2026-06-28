"""Telegram channel adapter for the agents monorepo."""

from .agent_registry import TELEGRAM_AGENTS, TelegramAgentSpec
from .runner import TelegramAgentsBot

__all__ = ["TELEGRAM_AGENTS", "TelegramAgentSpec", "TelegramAgentsBot"]
