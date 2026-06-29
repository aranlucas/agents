"""Resume Q&A agent domain: instruction and state."""

from pathlib import Path

from ag_ui_adk import AGUIToolset
from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    on_model_error_callback,
    stop_on_terminal_text,
)
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from pydantic import BaseModel

_RESUME = (Path(__file__).parent / "resume.md").read_text(encoding="utf-8")
INSTRUCTION = (
    (Path(__file__).parent / "instructions.md")
    .read_text(encoding="utf-8")
    .replace("{{RESUME}}", _RESUME)
)

_EVAL_INSTRUCTION = """\
You are a direct, specific assistant answering questions about Lucas Arango's
professional background for recruiters and hiring managers.

Ground answers only in these resume facts:
- Lucas is a senior full-stack software engineer in Seattle with 10+ years at
  DoorDash, AWS, and Amazon.
- At DoorDash, he pitched, prototyped, and served as lead engineer for Ask
  DoorDash, a conversational AI shopping experience across roughly 800K menu
  items and products.
- He drove DoorDash's external MCP integration for ChatGPT.
- He built DashMart personalization and fulfillment improvements and set
  performance/reliability standards including SLOs, CI regression gates, and
  production-like multi-tenant E2E environments.
- At AWS, he launched the AWS IoT SiteWise Monitor control plane, led the IoT
  Console Angular-to-React microfrontend migration, implemented SSO federation,
  and added AWS Synthetics canary testing.
- Earlier at Amazon Compliance Technologies, he built secure case-management
  and suspicious-transaction reporting systems.
- His stack includes React, Redux, HTML/CSS, TypeScript, JavaScript, Java
  Spring, Ruby on Rails, Golang, Python, SQL, DynamoDB, API Gateway, AWS CDK,
  FastAPI, Google ADK, MCP, AG-UI, CopilotKit, and LLM-powered product features.
- He runs a production personal multi-agent platform with Google ADK, MCP,
  AG-UI, a FastAPI gateway on Railway, a Next.js/CopilotKit web console, and an
  Expo mobile app.
- He is an application engineer who ships AI-powered products; do not claim he
  trains models or does ML research.
- He is looking for senior or staff software engineer roles, not management.

Rules:
- Keep answers concise, specific, and factual.
- For Telegram requests, answer in a short recruiter-friendly paragraph.
- Never invent employers, dates, compensation, addresses, private information,
  or accomplishments not listed above.
- If asked for private or ungrounded information, decline and offer to answer
  professional-background questions instead.
"""


class ResumeState(BaseModel):
    """Default shared-state shape for the public resume agent."""

    user_id: str = ""


def _build_agent(*, include_agui: bool, model: str) -> LlmAgent:
    return LlmAgent(
        name="resume_agent",
        description="Public resume Q&A.",
        model=LiteLlm(model=model),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        state_schema=ResumeState,
        instruction=INSTRUCTION,
        before_agent_callback=make_state_initializer(ResumeState),
        tools=[AGUIToolset()] if include_agui else [],
    )


def build_agent() -> LlmAgent:
    return _build_agent(
        include_agui=True,
        model="openrouter/openai/gpt-oss-120b:free",
    )


def build_telegram_agent() -> LlmAgent:
    return _build_agent(
        include_agui=False,
        model="mistral/mistral-medium-latest",
    )


def build_eval_agent() -> LlmAgent:
    """Eval-compatible agent: no AGUIToolset, no state_schema.

    Uses Mistral instead of the free OpenRouter tier so GEPA's parallel eval
    calls don't hit upstream 429s on the free rate-limited model.
    """
    return LlmAgent(
        name="resume_agent",
        description="Public resume Q&A.",
        model=LiteLlm(model="mistral/mistral-medium-latest"),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        instruction=_EVAL_INSTRUCTION,
        tools=[],
    )


root_agent = build_eval_agent()
