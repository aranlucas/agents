"""Research Canvas ADK agent.

Builds structured research reports section-by-section with citations,
following the repo's state-first AG-UI console architecture.
"""

from __future__ import annotations

import uuid

from ag_ui_adk import AGUIToolset
from agents_shared.prompts import canvas_contract
from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_model,
    on_model_error_callback,
    stop_on_terminal_text,
)
from google.adk.agents import LlmAgent
from google.adk.tools import ToolContext
from pydantic import BaseModel, Field


class ResearchState(BaseModel):
    title: str = ""
    query: str = ""
    report: str = ""
    sections: list = Field(default_factory=list)
    sources: list = Field(default_factory=list)
    status: str = "idle"
    review_summary: str = ""
    user_id: str = ""


def _rebuild_report(tool_context: ToolContext) -> None:
    """Regenerate state['report'] from sections and sources."""
    title = tool_context.state.get("title") or "Research Report"
    sections: list[dict] = tool_context.state.get("sections") or []
    sources: list[dict] = tool_context.state.get("sources") or []

    parts: list[str] = [f"# {title}", ""]
    for sec in sections:
        parts.append(f"## {sec['title']}")
        parts.append("")
        parts.append(sec["content"])
        parts.append("")
        parts.append("---")
        parts.append("")

    if sources:
        parts.append("## Sources")
        parts.append("")
        for src in sources:
            parts.append(f"- [{src['title']}]({src['url']}) — {src['snippet']}")
        parts.append("")

    tool_context.state["report"] = "\n".join(parts)


def set_research_query(
    tool_context: ToolContext,
    title: str,
    query: str,
) -> dict:
    """Set the research title and query; initialise status to 'drafting'."""
    tool_context.state["title"] = title
    tool_context.state["query"] = query
    tool_context.state["status"] = "drafting"
    return {"ok": True, "title": title}


def create_section(
    tool_context: ToolContext,
    section_title: str,
    content: str,
) -> dict:
    """Append a new section to the report and rebuild the markdown artifact."""
    section_id = f"sec_{uuid.uuid4().hex[:8]}"
    section = {"id": section_id, "title": section_title, "content": content}

    sections: list[dict] = tool_context.state.get("sections") or []
    sections.append(section)
    tool_context.state["sections"] = sections

    _rebuild_report(tool_context)
    return {"ok": True, "section_id": section_id}


def update_section(
    tool_context: ToolContext,
    section_id: str,
    content: str,
) -> dict:
    """Update an existing section's content by id and rebuild the markdown artifact."""
    sections: list[dict] = tool_context.state.get("sections") or []
    for sec in sections:
        if sec.get("id") == section_id:
            sec["content"] = content
            tool_context.state["sections"] = sections
            _rebuild_report(tool_context)
            return {"ok": True, "section_id": section_id}
    return {"ok": False, "error": "section_not_found"}


def add_source(
    tool_context: ToolContext,
    source_title: str,
    url: str,
    snippet: str,
) -> dict:
    """Append a citation source to the report."""
    source_id = f"src_{uuid.uuid4().hex[:8]}"
    source = {"id": source_id, "title": source_title, "url": url, "snippet": snippet}

    sources: list[dict] = tool_context.state.get("sources") or []
    sources.append(source)
    tool_context.state["sources"] = sources
    return {"ok": True, "source_id": source_id}


def write_report(
    tool_context: ToolContext,
    report: str,
) -> dict:
    """Write the full markdown report directly to state; set status to 'drafting'."""
    tool_context.state["report"] = report
    tool_context.state["status"] = "drafting"
    return {"ok": True, "length": len(report)}


def mark_research_ready(tool_context: ToolContext, summary: str) -> dict[str, bool]:
    """Mark the research report as ready and capture the review summary."""
    tool_context.state["status"] = "ready"
    tool_context.state["review_summary"] = summary
    return {"ok": True}


_CANVAS_CONTRACT = canvas_contract(
    artifact="research report",
    tools=(
        "set_research_query",
        "create_section",
        "update_section",
        "add_source",
        "write_report",
        "mark_research_ready",
    ),
)

_INSTRUCTION = (
    """You are Research Canvas, an AI research assistant that builds structured, \
well-cited reports on any topic.

When a user provides a topic or question, follow this sequence:
1. Call `set_research_query` with a clear title and the user's query.
2. Build the report section-by-section using `create_section`. Each section \
should have a focused title and substantive content drawn from your training \
knowledge.
3. For each key claim or sub-topic, call `add_source` with the most relevant \
authoritative reference you know (textbook, paper, standards body, official \
documentation). Since you do not have live internet access, use plausible, \
real-world sources you know from training and note the knowledge-cutoff \
limitation where relevant.
4. If you revise a section, use `update_section` with the section_id returned \
by `create_section`.
5. When the report is complete, call `mark_research_ready` with a one-sentence \
summary of what was produced.

This agent builds knowledge from its training data. It does not have live web \
search. It can synthesise authoritative, well-structured research on any topic \
it was trained on. Be honest about the knowledge cutoff (training data up to \
early 2025) and note when a topic may have evolved since then.

Never paste the full report into chat — use the tools above to write it to state \
so the UI can render it live.

"""
    + _CANVAS_CONTRACT
)

_STATE_INSTRUCTION = """\
Current research state:
- Title: {title}
- Query: {query}
- Report: {report}
- Sections: {sections}
- Sources: {sources}
- Status: {status}
- Review summary: {review_summary}
- User ID: {user_id}
"""


def build_agent() -> LlmAgent:
    return LlmAgent(
        name="research_canvas_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        state_schema=ResearchState,
        static_instruction=_INSTRUCTION,
        instruction=_STATE_INSTRUCTION,
        before_agent_callback=make_state_initializer(ResearchState),
        tools=[
            set_research_query,
            create_section,
            update_section,
            add_source,
            write_report,
            mark_research_ready,
            AGUIToolset(),
        ],
    )
