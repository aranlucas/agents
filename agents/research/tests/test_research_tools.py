from research_agent.tools.add_source import add_source
from research_agent.tools.create_section import create_section
from research_agent.tools.mark_research_ready import mark_research_ready
from research_agent.tools.set_research_query import set_research_query
from research_agent.tools.update_section import update_section
from research_agent.tools.write_report import write_report


class Ctx:
    def __init__(self, state=None):
        self.state = state or {}


def test_set_research_query_writes_state() -> None:
    ctx = Ctx()
    result = set_research_query(
        ctx, title="Healthcare AI Report", query="AI in healthcare"
    )
    assert result["ok"] is True
    assert result["title"] == "Healthcare AI Report"
    assert ctx.state["query"] == "AI in healthcare"
    assert ctx.state["title"] == "Healthcare AI Report"
    assert ctx.state["status"] == "drafting"


def test_create_section_appends_and_rebuilds_report() -> None:
    ctx = Ctx({"title": "My Report"})
    r = create_section(
        ctx, section_title="Introduction", content="AI is transforming healthcare."
    )
    assert r["ok"] is True
    assert len(ctx.state["sections"]) == 1
    assert "Introduction" in ctx.state["report"]
    assert "AI is transforming" in ctx.state["report"]


def test_update_section_modifies_content() -> None:
    ctx = Ctx({"title": "Report"})
    r = create_section(ctx, section_title="Intro", content="Old content.")
    sec_id = r["section_id"]
    result = update_section(ctx, section_id=sec_id, content="New content.")
    assert result == {"ok": True, "section_id": sec_id}
    assert ctx.state["sections"][0]["content"] == "New content."
    assert "New content." in ctx.state["report"]


def test_update_section_returns_error_for_missing_id() -> None:
    ctx = Ctx({"sections": []})
    result = update_section(ctx, section_id="bad", content="X")
    assert result["ok"] is False


def test_add_source_appends_source() -> None:
    ctx = Ctx({"title": "Report", "sections": []})
    r = add_source(
        ctx,
        source_title="Nature Paper",
        url="https://nature.com/x",
        snippet="Key finding.",
    )
    assert r["ok"] is True
    assert len(ctx.state["sources"]) == 1


def test_write_report_sets_report() -> None:
    ctx = Ctx()
    result = write_report(ctx, report="# Final Report\n\nContent here.")
    assert result["ok"] is True
    assert result["length"] == len("# Final Report\n\nContent here.")
    assert ctx.state["report"] == "# Final Report\n\nContent here."
    assert ctx.state["status"] == "drafting"


def test_mark_research_ready() -> None:
    ctx = Ctx()
    result = mark_research_ready(ctx, summary="Research complete.")
    assert result == {"ok": True}
    assert ctx.state["status"] == "ready"
    assert ctx.state["review_summary"] == "Research complete."
