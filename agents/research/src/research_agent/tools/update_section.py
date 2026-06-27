from __future__ import annotations

from google.adk.tools import FunctionTool, ToolContext


def _rebuild_report(tool_context: ToolContext) -> None:
    title = tool_context.state.get("title") or "Research Report"
    sections: list[dict] = tool_context.state.get("sections") or []
    sources: list[dict] = tool_context.state.get("sources") or []
    parts: list[str] = [f"# {title}", ""]
    for sec in sections:
        parts.extend([f"## {sec['title']}", "", sec["content"], "", "---", ""])
    if sources:
        parts.append("## Sources")
        parts.append("")
        for src in sources:
            parts.append(f"- [{src['title']}]({src['url']}) — {src['snippet']}")
        parts.append("")
    tool_context.state["report"] = "\n".join(parts)


def update_section(tool_context: ToolContext, section_id: str, content: str) -> dict:
    """Update an existing section's content by id and rebuild the markdown artifact."""
    sections: list[dict] = tool_context.state.get("sections") or []
    for sec in sections:
        if sec.get("id") == section_id:
            sec["content"] = content
            tool_context.state["sections"] = sections
            _rebuild_report(tool_context)
            return {"ok": True, "section_id": section_id}
    return {"ok": False, "error": "section_not_found"}


tool = FunctionTool(update_section)
