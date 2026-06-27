from typing import Annotated

from google.adk.tools import FunctionTool, ToolContext
from pydantic import Field

from ._types import CaseSource


def set_case(
    tool_context: ToolContext,
    case: Annotated[
        str, Field(description="Grounded case vignette in concise markdown")
    ],
    case_sources: Annotated[
        list[CaseSource],
        Field(
            description="Source provenance list from search_docs results: {docid, filepath, title, snippet, collection}"
        ),
    ] = (),
    case_passages: Annotated[
        list[str],
        Field(
            description="Relevant text passages from search_docs results (the 'passage' field of each result)."
        ),
    ] = (),
) -> dict:
    """Write the grounded case vignette, source provenance, and passages to shared state."""
    tool_context.state["case"] = case
    tool_context.state["case_sources"] = case_sources or []
    tool_context.state["case_passages"] = (
        "\n\n---\n\n".join(case_passages) if case_passages else ""
    )
    tool_context.state["interview_complete"] = False
    tool_context.state["status"] = "presenting"
    return {"status": "success", "ok": True, "length": len(case)}


tool = FunctionTool(set_case)
