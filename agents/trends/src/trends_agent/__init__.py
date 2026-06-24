import json
import logging
import os
import tempfile

from google.genai import types

log = logging.getLogger("trends_agent")


def _bootstrap_gcp_credentials() -> None:
    creds_json = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if not creds_json:
        return
    with tempfile.NamedTemporaryFile(delete=False, suffix=".json", mode="w") as tmp:
        tmp.write(creds_json)
        tmp_name = tmp.name
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = tmp_name
    project = json.loads(creds_json).get("project_id", "")
    os.environ.setdefault("GOOGLE_CLOUD_PROJECT", project)


_bootstrap_gcp_credentials()


# ---------------------------------------------------------------------------
# Monkey-patch A2UISubAgentTool._conversation_contents (ag-ui-adk 0.7.0).
#
# Two upstream bugs fixed:
#   1. Early return — "return contents" is inside the for-loop, so only the
#      first text-only event reaches the A2UI subagent.
#   2. reasoning_content leak — Parts with thought=True (from Gemini/Groq
#      thinking tokens) pass through and LiteLLM serialises them as
#      "reasoning_content" in the OpenAI-format request, which every
#      non-Gemini provider (Cerebras, Groq, Mistral) rejects, exhausting
#      the fallback chain and making generate_a2ui hang until retry timeout.
# ---------------------------------------------------------------------------
try:
    from ag_ui_adk.a2ui_tool import A2UISubAgentTool

    _original = A2UISubAgentTool._conversation_contents

    @staticmethod
    def _patched_conversation_contents(events: list) -> list:
        contents: list = []
        for ev in events:
            if getattr(ev, "partial", False):
                continue
            content = getattr(ev, "content", None)
            parts = getattr(content, "parts", None)
            if not parts:
                continue
            # Strip reasoning/thinking parts — LiteLLM maps thought=True to
            # "reasoning_content" in the OpenAI-format body, which Cerebras,
            # Groq, and Mistral reject with 400.
            clean_parts = [
                p for p in parts
                if getattr(p, "text", None) and not getattr(p, "thought", False)
            ]
            if not clean_parts:
                continue
            has_calls = (
                bool(ev.get_function_calls())
                if hasattr(ev, "get_function_calls") else False
            )
            has_responses = (
                bool(ev.get_function_responses())
                if hasattr(ev, "get_function_responses") else False
            )
            if not has_calls and not has_responses:
                contents.append(
                    types.Content(
                        role=getattr(content, "role", None),
                        parts=clean_parts,
                    )
                )
        # BUG FIXED: return after the FULL loop, not inside it
        return contents

    A2UISubAgentTool._conversation_contents = _patched_conversation_contents
    log.info("A2UISubAgentTool._conversation_contents patched (thought-strip + early-return fix)")
except ImportError:
    log.warning("ag_ui_adk not available; A2UI conversation patching skipped")
