from typing import Annotated

from google.adk.tools import ToolContext
from pydantic import Field

from ._types import OralBoardsSkill


def set_question_target(
    skillset: Annotated[
        str,
        Field(
            description="Exact ABPD blueprint domain name the next question assesses, e.g. 'Pulp Therapy' (exact domain name from the blueprint table)"
        ),
    ],
    skill: Annotated[
        OralBoardsSkill,
        Field(
            description="Blueprint cognitive skill level the next question tests: 'remember', 'understand_apply', or 'analyze_evaluate'"
        ),
    ],
    tool_context: ToolContext,
) -> dict[str, object]:
    """Declare the blueprint skillset and skill level the next question will assess."""
    tool_context.state["target_skillset"] = skillset
    tool_context.state["target_skill"] = skill
    return {"status": "success"}
