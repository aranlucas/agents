from typing import Annotated, Literal

from google.adk.tools import FunctionTool, ToolContext
from pydantic import Field

from ._types import SkillsetScore


def set_score_card(
    tool_context: ToolContext,
    markdown: Annotated[
        str,
        Field(
            description="Narrative score-card markdown. Use ONLY the ABPD 1-3 scale. Do NOT compute a weighted composite or any /100 or /5 score."
        ),
    ],
    score_summary: Annotated[
        list[SkillsetScore],
        Field(
            description="Structured per-skillset scores: list of {skillset, skill, score (1-3), rationale}."
        ),
    ],
    outcome: Annotated[
        Literal["pass", "borderline", "not_yet"],
        Field(
            description="Overall practice-outcome estimate. The real OCE is Pass/Fail decided by examiners."
        ),
    ],
) -> dict:
    """Write the final cited score card, per-skillset scores, and practice outcome."""
    tool_context.state["score_card"] = markdown
    tool_context.state["score_summary"] = list(score_summary) or []
    tool_context.state["outcome"] = outcome
    tool_context.state["status"] = "complete"
    return {"status": "success", "ok": True, "length": len(markdown)}


tool = FunctionTool(set_score_card)
