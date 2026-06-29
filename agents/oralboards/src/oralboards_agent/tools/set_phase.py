from typing import Annotated, Literal

from google.adk.tools import ToolContext
from pydantic import Field


def set_phase(
    tool_context: ToolContext,
    phase: Annotated[
        Literal["presenting", "questioning", "complete"],
        Field(description="Exam phase to transition to"),
    ],
) -> dict[str, object]:
    """Set the current oral-exam status phase."""
    tool_context.state["status"] = phase
    return {"status": "success", "ok": True, "phase": phase}
