"""Grocery Planning Agent — wiring (see agent.py for domain logic)."""

import litellm
from agents_shared.app_factory import (
    add_agent_routes,
    build_adk_agent_from_app,
    streaming_state_mapping,
)
from agents_shared.dependencies import AgentServices
from agents_shared.plugins.slim_mcp import SlimMcpPlugin
from agents_shared.state import KROGER_AUTH, make_extract_state
from dotenv import load_dotenv
from fastapi import FastAPI
from google.adk.apps import App
from google.adk.apps.app import EventsCompactionConfig
from google.adk.apps.llm_event_summarizer import LlmEventSummarizer
from google.adk.models.lite_llm import LiteLlm

from .agent import build_agent

load_dotenv()

# NIM's deepseek-v4-flash endpoint enforces a 262 144-token cap (the model
# supports 1 M but the free-tier API returns this limit). Register it so
# LiteLLM can pre-validate and trigger context_window_fallbacks before the
# request reaches the wire.
litellm.register_model(
    {
        "nvidia_nim/deepseek-ai/deepseek-v4-flash": {
            "max_tokens": 262144,
            "max_input_tokens": 262144,
            "max_output_tokens": 8192,
            "input_cost_per_token": 0,
            "output_cost_per_token": 0,
            "litellm_provider": "nvidia_nim",
            "mode": "chat",
        }
    }
)

GROCERY_PREDICT_STATE = [
    streaming_state_mapping(
        state_key="meal_plan", tool="set_meal_plan", tool_argument="plan"
    ),
]

_grocery_agent = build_agent()

# Compact session history once it approaches the NIM context cap.
# token_threshold=150_000 gives plenty of headroom below the 262 K limit;
# event_retention_size=15 keeps the most recent tool-call/response pairs intact
# so the agent retains full short-term memory.
_app = App(
    name="grocery_agent",
    root_agent=_grocery_agent,
    plugins=[SlimMcpPlugin()],
    events_compaction_config=EventsCompactionConfig(
        # Sliding-window fallback: compact every 20 invocations (rarely fires
        # since the token threshold below triggers first in practice).
        compaction_interval=20,
        overlap_size=2,
        # Token-based trigger: compact once the session history hits 150 K —
        # well under the NIM endpoint's 262 K cap, so we never hit the limit.
        token_threshold=150_000,
        event_retention_size=15,
        summarizer=LlmEventSummarizer(
            llm=LiteLlm(model="groq/llama-3.3-70b-versatile"),
        ),
    ),
)


def register(app: FastAPI, services: AgentServices):
    add_agent_routes(
        app,
        prefix="/grocery",
        adk_agent=build_adk_agent_from_app(
            _app,
            services=services,
            predict_state=GROCERY_PREDICT_STATE,
        ),
        services=services,
        extract_state_from_request=make_extract_state(KROGER_AUTH),
    )
