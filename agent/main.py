"""Collaborative Document Studio — agent backend.

A single ADK agent that:
  * streams document content into shared state token-by-token
    (PredictStateMapping → live UI rendering),
  * reads user-supplied preferences (tone, audience, length) and respects
    them via a before-model callback that injects a preferences block into
    the system instruction,
  * requests human approval before "publishing" via a frontend tool
    (request_user_approval) registered with useFrontendTool on the UI.

Backed by Gemini via LiteLLM (Mistral fallback supported). The FastAPI app
mounts the agent at "/" via ag-ui-adk, plus a /health endpoint for the
dev script.
"""

from __future__ import annotations

import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ag_ui_adk import ADKAgent, AGUIToolset, add_adk_fastapi_endpoint
from ag_ui_adk.config import PredictStateMapping

from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.models import LlmRequest
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import ToolContext
from google.genai import types as genai_types

load_dotenv()


# ---------------------------------------------------------------------------
# Model selection — Gemini by default, Mistral via LiteLLM if requested.
# ---------------------------------------------------------------------------
def _get_model():
    if os.getenv("USE_MISTRAL") == "1" and os.getenv("MISTRAL_API_KEY"):
        return LiteLlm(model="mistral/mistral-medium-latest")
    return os.getenv("ADK_MODEL", "gemini-2.5-flash")


# ---------------------------------------------------------------------------
# Tools — written entirely against shared state.
# ---------------------------------------------------------------------------
def write_document(tool_context: ToolContext, title: str, content: str) -> dict:
    """Replace the working document with new title + body.

    PredictStateMapping below makes `content` stream into state["document"]
    token-by-token so the UI shows the agent typing live.
    """
    tool_context.state["document"] = content
    tool_context.state["title"] = title
    tool_context.state["status"] = "drafting"
    return {"ok": True, "length": len(content)}


def append_section(
    tool_context: ToolContext, heading: str, content: str
) -> dict:
    """Append a new section to the existing document body."""
    current = tool_context.state.get("document", "") or ""
    sep = "\n\n" if current.strip() else ""
    section = f"{sep}## {heading}\n\n{content}"
    tool_context.state["document"] = current + section
    tool_context.state["status"] = "drafting"
    return {"ok": True, "length": len(tool_context.state["document"])}


def mark_ready_for_review(tool_context: ToolContext, summary: str) -> dict:
    """Flag the document as ready for the operator to review."""
    tool_context.state["status"] = "ready_for_review"
    tool_context.state["review_summary"] = summary
    return {"ok": True}


# ---------------------------------------------------------------------------
# Preferences injection — UI writes state["preferences"]; we read it back
# each turn and prepend a fresh preferences block to the system instruction.
# ---------------------------------------------------------------------------
_PREFS_MARK_START = "<<<USER_PREFERENCES>>>"
_PREFS_MARK_END = "<<<END_USER_PREFERENCES>>>"


def _build_prefs_block(prefs: dict) -> Optional[str]:
    if not prefs or not isinstance(prefs, dict):
        return None

    lines = [_PREFS_MARK_START]
    if name := prefs.get("authorName"):
        lines.append(f"- Author name: {name}")
    if tone := prefs.get("tone"):
        lines.append(f"- Tone: {tone}")
    if audience := prefs.get("audience"):
        lines.append(f"- Audience: {audience}")
    if length := prefs.get("length"):
        lines.append(f"- Target length: {length}")
    if focus := prefs.get("focus"):
        lines.append(f"- Focus: {focus}")
    lines.append(_PREFS_MARK_END)

    if len(lines) <= 2:
        return None
    return "\n".join(lines)


def _strip_old_prefs(text: str) -> str:
    if _PREFS_MARK_START not in text:
        return text
    before, _, rest = text.partition(_PREFS_MARK_START)
    _, _, after = rest.partition(_PREFS_MARK_END)
    return (before.rstrip() + "\n\n" + after.lstrip()).strip()


def _inject_preferences(
    callback_context: CallbackContext, llm_request: LlmRequest
) -> None:
    prefs = callback_context.state.to_dict().get("preferences") or {}
    block = _build_prefs_block(prefs)

    cfg = llm_request.config or genai_types.GenerateContentConfig()
    existing = cfg.system_instruction
    base = ""
    if isinstance(existing, str):
        base = existing
    elif isinstance(existing, genai_types.Content) and existing.parts:
        base = "\n".join(p.text or "" for p in existing.parts)

    base = _strip_old_prefs(base)
    new_instruction = f"{block}\n\n{base}" if block else base
    cfg.system_instruction = new_instruction
    llm_request.config = cfg


# ---------------------------------------------------------------------------
# Agent instruction — emphasizes collaboration patterns.
# ---------------------------------------------------------------------------
_INSTRUCTION = """You are a collaborative writing partner for the operator.

Your job is to draft, revise, and improve a working document in shared state.

Rules:
1. NEVER paste long-form content into chat. The document lives in
   state["document"]. ALWAYS call `write_document` (full rewrite) or
   `append_section` (additive) when producing content.
2. After each tool call, reply with a SHORT (1–2 sentence) summary of
   what changed and what you'll do next.
3. Respect the USER_PREFERENCES block when present — tone, audience, and
   target length materially change voice and structure.
4. Before doing anything DESTRUCTIVE or PUBLIC — publishing, sharing,
   sending, deleting, or charging — call the frontend tool
   `request_user_approval` with a clear summary and wait for the user's
   decision. Only proceed if approved.
5. When the user says the draft looks good, call `mark_ready_for_review`
   with a 1-sentence summary.

Be concise, warm, and proactive. Suggest one concrete next move at the
end of each turn.
"""


collab_doc_agent = LlmAgent(
    name="collab_doc_agent",
    model=_get_model(),
    instruction=_INSTRUCTION,
    before_model_callback=_inject_preferences,
    tools=[
        write_document,
        append_section,
        mark_ready_for_review,
        AGUIToolset(),
    ],
)


# Token-level streaming for the document body — the UI re-renders as each
# token arrives, mimicking shared-state-streaming from the showcase.
COLLAB_PREDICT_STATE = [
    PredictStateMapping(
        state_key="document",
        tool="write_document",
        tool_argument="content",
        emit_confirm_tool=False,
        stream_tool_call=True,
    ),
]


# ---------------------------------------------------------------------------
# FastAPI wiring.
# ---------------------------------------------------------------------------
adk_collab_agent = ADKAgent(
    adk_agent=collab_doc_agent,
    user_id="demo_user",
    session_timeout_seconds=3600,
    use_in_memory_services=True,
    predict_state=COLLAB_PREDICT_STATE,
)

app = FastAPI(title="Collaborative Doc Studio")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

add_adk_fastapi_endpoint(app, adk_collab_agent, path="/")


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
