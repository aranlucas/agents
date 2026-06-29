from typing import Annotated

from google.adk.tools import ToolContext
from pydantic import Field


def set_loading_step(
    tool_context: ToolContext,
    step: Annotated[
        str,
        Field(
            description="Human-readable progress message shown during long operations."
        ),
    ],
) -> dict[str, object]:
    """Report a human-readable progress step during search or generation phases."""
    tool_context.state["loading_step"] = step
    return {"status": "success", "ok": True}
