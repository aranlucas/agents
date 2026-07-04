from typing import Annotated

from google.adk.tools import ToolContext
from pydantic import Field


def ask_probe(
    question: Annotated[
        str,
        Field(
            description="One probing follow-up question on the CURRENT skillset, asked before scoring a partial answer"
        ),
    ],
    tool_context: ToolContext,
) -> dict[str, object]:
    """Ask exactly one probing follow-up before scoring; displayed in the exam panel."""
    if tool_context.state.get("active_probe"):
        return {
            "status": "error",
            "message": "Probe already used for this question — score the combined answers with append_exchange now.",
        }
    tool_context.state["active_probe"] = question
    tool_context.state["current_question"] = question
    return {"status": "success", "message": "Probe question displayed."}
