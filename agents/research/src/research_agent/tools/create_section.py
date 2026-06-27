from __future__ import annotations

import uuid

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


def create_section(tool_context: ToolContext, section_title: str, content: str) -> dict:
    """Append a new section to the report and rebuild the markdown artifact."""
    section_id = f"sec_{uuid.uuid4().hex[:8]}"
    sections: list[dict] = tool_context.state.get("sections") or []
    sections.append({"id": section_id, "title": section_title, "content": content})
    tool_context.state["sections"] = sections
    _rebuild_report(tool_context)
    return {"ok": True, "section_id": section_id}


tool = FunctionTool(create_section)
