from typing import Annotated, Literal

from google.adk.tools import FunctionTool, ToolContext
from pydantic import Field

from ._types import CaseSource, OralBoardsSkill


def append_exchange(
    tool_context: ToolContext,
    question: Annotated[
        str, Field(description="The exact question text the examiner asked")
    ],
    answer: Annotated[str, Field(description="The candidate's verbatim answer")],
    skillset: Annotated[
        str,
        Field(
            description="The ABPD blueprint domain this question assessed, e.g. 'Pulp Therapy' (exact domain name from the blueprint table)"
        ),
    ],
    skill: Annotated[
        OralBoardsSkill,
        Field(
            description="Blueprint cognitive skill level: 'remember', 'understand_apply', or 'analyze_evaluate'"
        ),
    ],
    feedback: Annotated[
        str,
        Field(
            description="Cited feedback markdown. Must begin with: **Skillset:** <domain> · <skill level>."
        ),
    ],
    ideal_response: Annotated[
        str,
        Field(
            description="Model answer the candidate should have given, grounded in sourced documents"
        ),
    ],
    score: Annotated[
        Literal[1, 2, 3],
        Field(description="Practice score for this skillset on the ABPD 1-3 scale"),
    ],
    citations: Annotated[
        list[CaseSource],
        Field(
            description="Source provenance for this exchange from search_docs results"
        ),
    ]
    | None = None,
) -> dict[str, object]:
    """Append one examiner question, answer, cited feedback, score, and ideal response."""
    transcript = list(tool_context.state.get("transcript") or [])
    transcript.append(
        {
            "question": question,
            "answer": answer,
            "skillset": skillset,
            "skill": skill,
            "feedback": feedback,
            "ideal_response": ideal_response,
            "score": score,
            "citations": citations or [],
        },
    )
    tool_context.state["transcript"] = transcript
    tool_context.state["status"] = "questioning"
    tool_context.state["current_question"] = ""
    tool_context.state["active_feedback"] = ""
    tool_context.state["active_ideal_response"] = ""
    return {"status": "success", "ok": True, "count": len(transcript)}


tool = FunctionTool(append_exchange)
