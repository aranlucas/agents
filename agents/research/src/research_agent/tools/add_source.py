import uuid

from google.adk.tools import FunctionTool, ToolContext


def add_source(
    tool_context: ToolContext, source_title: str, url: str, snippet: str
) -> dict:
    """Append a citation source to the report."""
    source_id = f"src_{uuid.uuid4().hex[:8]}"
    sources: list[dict] = tool_context.state.get("sources") or []
    sources.append(
        {"id": source_id, "title": source_title, "url": url, "snippet": snippet}
    )
    tool_context.state["sources"] = sources
    return {"ok": True, "source_id": source_id}


tool = FunctionTool(add_source)
