"""Default Telegram orchestrator that delegates to surfaced ADK agents."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Protocol

from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    on_model_error_callback,
    stop_on_terminal_text,
)
from google.adk.agents import BaseAgent, LlmAgent
from google.adk.models.lite_llm import LiteLlm

ORCHESTRATOR_AGENT_ID = "orchestrator"
ORCHESTRATOR_TITLE = "Orchestrator"
ORCHESTRATOR_DESCRIPTION = (
    "Default router that delegates to the best specialist sub-agent."
)
TELEGRAM_ORCHESTRATOR_MODEL = "mistral/mistral-medium-latest"


class TelegramAgentLike(Protocol):
    @property
    def description(self) -> str: ...

    @property
    def build(self) -> Callable[[], object]: ...


def _base_agents(specs: Iterable[TelegramAgentLike]) -> list[BaseAgent]:
    base_agents: list[BaseAgent] = []
    for spec in specs:
        agent = spec.build()
        if isinstance(agent, BaseAgent):
            agent.description = spec.description
            if isinstance(agent, LlmAgent) and not agent.sub_agents:
                agent.mode = "task"
            base_agents.append(agent)
    return base_agents


def build_orchestrator_agent() -> LlmAgent:
    """Build a Telegram-first router over the BaseAgent-backed agents."""
    from .agent_registry import TELEGRAM_SURFACED_AGENTS

    child_agents = _base_agents(TELEGRAM_SURFACED_AGENTS)
    return LlmAgent(
        name="telegram_orchestrator_agent",
        description="Routes Telegram user requests to the best ADK sub-agent.",
        rerun_on_resume=True,
        model=LiteLlm(model=TELEGRAM_ORCHESTRATOR_MODEL),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        instruction=(
            "You are the default Telegram orchestrator for the Agents workspace.\n"
            "Your job is to choose the best specialist sub-agent, delegate to it, and "
            "return a concise Telegram-friendly answer.\n\n"
            "Routing rules:\n"
            "- Delegate to exactly one specialist sub-agent for normal requests.\n"
            "- Ask a short clarification question if the correct specialist is unclear.\n"
            "- Most specialists are task-mode leaf agents and return control to you "
            "automatically. Wellness is itself a coordinator with nested sub-agents, "
            "so do not treat it as a task-mode leaf.\n"
            "- The oral-boards-v2 workflow is available in Telegram through "
            "`/agent oral-boards-v2`; if a user specifically asks for v2, tell them "
            "to switch to that agent.\n"
            "- If the sub-agent wrote a state artifact and returned little text, "
            "summarize what changed rather than saying nothing.\n"
            "- Keep replies short enough for Telegram.\n\n"
            "Credential-gated agents (check before routing):\n"
            "- kroger_connected: {kroger_connected?}\n"
            "  grocery_agent and wellness_agent require Kroger/QFC.\n"
            "  If kroger_connected is not True, do NOT route to them.\n"
            "  Instead tell the user to connect Kroger in the web app settings.\n"
            "- strava_connected: {strava_connected?}\n"
            "  fitness_agent and wellness_agent require Strava.\n"
            "  If strava_connected is not True, do NOT route to them.\n"
            "  Instead tell the user to connect Strava in the web app settings.\n"
            "- wellness_agent needs both Kroger AND Strava.\n"
            "  Only route to wellness if both are connected."
        ),
        sub_agents=child_agents,
    )
