"""Default Telegram orchestrator that delegates to specialist ADK agents."""

from __future__ import annotations

from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    on_model_error_callback,
    stop_on_terminal_text,
    strip_thinking_before_model,
)
from excalidraw_agent.agent import build_telegram_agent as build_excalidraw
from expense_agent.agent import build_telegram_agent as build_expense
from fitness_agent.agent import build_telegram_agent as build_fitness
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from grocery_agent.agent import build_telegram_agent as build_grocery
from oralboards_agent.agent import build_telegram_agent as build_oralboards
from presentation_agent.agent import build_telegram_agent as build_presentation
from research_agent.agent import build_telegram_agent as build_research
from resume_agent.agent import build_telegram_agent as build_resume
from spreadsheet_agent.agent import build_telegram_agent as build_spreadsheet
from travel_agent.agent import build_telegram_agent as build_travel
from trends_agent.agent import build_agent as build_trends
from wellness_agent.agent import build_telegram_agent as build_wellness

ORCHESTRATOR_AGENT_ID = "orchestrator"
ORCHESTRATOR_TITLE = "Orchestrator"
ORCHESTRATOR_DESCRIPTION = (
    "Default router that delegates to the best specialist sub-agent."
)
TELEGRAM_ORCHESTRATOR_MODEL = "mistral/mistral-medium-latest"


def build_orchestrator_agent() -> LlmAgent:
    """Build a Telegram-first router over the BaseAgent-backed agents."""
    child_agents = [
        build_excalidraw(),
        build_travel(),
        build_grocery(),
        build_fitness(),
        build_wellness(),
        build_expense(),
        build_oralboards(),
        build_trends(),
        build_resume(),
        build_research(),
        build_spreadsheet(),
        build_presentation(),
    ]
    for agent in child_agents:
        if not agent.sub_agents:
            agent.mode = "task"

    return LlmAgent(
        name="telegram_orchestrator_agent",
        description="Routes Telegram user requests to the best ADK sub-agent.",
        rerun_on_resume=True,
        model=LiteLlm(model=TELEGRAM_ORCHESTRATOR_MODEL),
        retry_config=DEFAULT_RETRY_CONFIG,
        before_model_callback=strip_thinking_before_model,
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
