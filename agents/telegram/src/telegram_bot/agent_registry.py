"""Registered ADK agents exposed through Telegram."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from excalidraw_agent.agent import build_telegram_agent as build_excalidraw
from expense_agent.agent import build_telegram_agent as build_expense
from fitness_agent.agent import build_telegram_agent as build_fitness
from grocery_agent.agent import build_telegram_agent as build_grocery
from oralboards_agent.agent import build_telegram_agent as build_oralboards
from oralboards_agent.workflow_agent import build_workflow_agent
from presentation_agent.agent import build_telegram_agent as build_presentation
from research_agent.agent import build_telegram_agent as build_research
from resume_agent.agent import build_telegram_agent as build_resume
from spreadsheet_agent.agent import build_telegram_agent as build_spreadsheet
from travel_agent.agent import build_telegram_agent as build_travel
from trends_agent.agent import build_agent as build_trends
from wellness_agent.agent import build_telegram_agent as build_wellness

from .orchestrator import (
    ORCHESTRATOR_AGENT_ID,
    ORCHESTRATOR_DESCRIPTION,
    ORCHESTRATOR_TITLE,
    build_orchestrator_agent,
)


@dataclass(frozen=True)
class TelegramAgentSpec:
    """A surfaced agent that can be selected from Telegram."""

    id: str
    title: str
    description: str
    build: Callable[[], object]


TELEGRAM_SURFACED_AGENTS: tuple[TelegramAgentSpec, ...] = (
    TelegramAgentSpec(
        id="excalidraw",
        title="Excalidraw",
        description="Collaborative whiteboard assistant.",
        build=build_excalidraw,
    ),
    TelegramAgentSpec(
        id="travel",
        title="Travel",
        description="Trip planning, itinerary drafting, and booking readiness.",
        build=build_travel,
    ),
    TelegramAgentSpec(
        id="grocery",
        title="Grocery",
        description="Meal planning, pantry, shopping list, and cart support.",
        build=build_grocery,
    ),
    TelegramAgentSpec(
        id="fitness",
        title="Fitness",
        description="Training plans and Strava-backed activity context.",
        build=build_fitness,
    ),
    TelegramAgentSpec(
        id="wellness",
        title="Wellness",
        description="In-process grocery and fitness orchestration.",
        build=build_wellness,
    ),
    TelegramAgentSpec(
        id="expense",
        title="Expense",
        description="Expense review and approval-desk workflow.",
        build=build_expense,
    ),
    TelegramAgentSpec(
        id="oral-boards",
        title="Oral Boards",
        description="Pediatric dentistry oral-board practice.",
        build=build_oralboards,
    ),
    TelegramAgentSpec(
        id="oral-boards-v2",
        title="Oral Boards V2",
        description="Workflow-based oral-board examiner.",
        build=build_workflow_agent,
    ),
    TelegramAgentSpec(
        id="trends",
        title="Trends",
        description="Google Trends BigQuery analysis and verification.",
        build=build_trends,
    ),
    TelegramAgentSpec(
        id="resume",
        title="Resume",
        description="Public resume Q&A.",
        build=build_resume,
    ),
    TelegramAgentSpec(
        id="research",
        title="Research",
        description="Research canvas, sources, sections, and reports.",
        build=build_research,
    ),
    TelegramAgentSpec(
        id="spreadsheet",
        title="Spreadsheet",
        description="Spreadsheet creation, editing, and summaries.",
        build=build_spreadsheet,
    ),
    TelegramAgentSpec(
        id="presentation",
        title="Presentation",
        description="Presentation outline and slide authoring.",
        build=build_presentation,
    ),
)

TELEGRAM_AGENTS: tuple[TelegramAgentSpec, ...] = (
    TelegramAgentSpec(
        id=ORCHESTRATOR_AGENT_ID,
        title=ORCHESTRATOR_TITLE,
        description=ORCHESTRATOR_DESCRIPTION,
        build=build_orchestrator_agent,
    ),
    *TELEGRAM_SURFACED_AGENTS,
)

TELEGRAM_AGENT_IDS = tuple(spec.id for spec in TELEGRAM_AGENTS)
TELEGRAM_AGENT_BY_ID = {spec.id: spec for spec in TELEGRAM_AGENTS}
