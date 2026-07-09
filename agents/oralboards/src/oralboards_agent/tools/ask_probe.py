from typing import Annotated

from google.adk.tools import ToolContext
from pydantic import Field

from .search_docs import SEARCH_CALL_COUNT_KEY


def ask_probe(
    question: Annotated[
        str,
        Field(
            description="One probing follow-up question on the CURRENT skillset, asked before scoring a partial answer"
        ),
    ],
    tool_context: ToolContext,
) -> dict[str, object]:
    """Ask exactly one probing follow-up before scoring; displayed in the exam panel.

    Sets a `temp:` (invocation-scoped, non-persisted) flag so append_exchange
    can refuse to score in the same turn a probe was just asked — the
    candidate hasn't answered the probe yet.
    """
    if tool_context.state.get("active_probe"):
        return {
            "status": "error",
            "message": "Probe already used for this question — score the combined answers with append_exchange now.",
        }
    tool_context.state["active_probe"] = question
    tool_context.state["current_question"] = question
    tool_context.state[SEARCH_CALL_COUNT_KEY] = 0
    tool_context.state["temp:probe_asked_now"] = True
    return {"status": "success", "message": "Probe question displayed."}
