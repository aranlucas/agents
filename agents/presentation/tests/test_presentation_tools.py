from presentation_agent.tools.create_slide import create_slide
from presentation_agent.tools.delete_slide import delete_slide
from presentation_agent.tools.mark_presentation_ready import mark_presentation_ready
from presentation_agent.tools.reorder_slides import reorder_slides
from presentation_agent.tools.set_presentation_meta import set_presentation_meta
from presentation_agent.tools.update_slide import update_slide


class Ctx:
    def __init__(self, state=None):
        self.state = state or {}


def test_set_presentation_meta_writes_state() -> None:
    ctx = Ctx()
    result = set_presentation_meta(ctx, title="Intro", theme="dark")
    assert result == {"ok": True}
    assert ctx.state["title"] == "Intro"
    assert ctx.state["theme"] == "dark"
    assert ctx.state["status"] == "drafting"


def test_create_slide_appends_and_sets_index() -> None:
    ctx = Ctx()
    r1 = create_slide(
        ctx, heading="Slide 1", body="Body", slide_type="content", notes=""
    )
    assert r1["ok"] is True
    assert len(ctx.state["slides"]) == 1
    assert ctx.state["active_slide_index"] == 0

    r2 = create_slide(
        ctx, heading="Slide 2", body="B2", slide_type="bullets", notes="n"
    )
    assert r2["ok"] is True
    assert len(ctx.state["slides"]) == 2
    assert ctx.state["active_slide_index"] == 1
    assert ctx.state["status"] == "drafting"


def test_update_slide_modifies_existing() -> None:
    ctx = Ctx()
    r = create_slide(ctx, heading="Old", body="B", slide_type="content", notes="")
    slide_id = r["slide_id"]
    result = update_slide(ctx, slide_id=slide_id, heading="New", body="B2", notes="n")
    assert result == {"ok": True, "slide_id": slide_id}
    assert ctx.state["slides"][0]["heading"] == "New"


def test_update_slide_returns_error_for_missing_id() -> None:
    ctx = Ctx({"slides": []})
    result = update_slide(ctx, slide_id="bad", heading="X", body="Y", notes="")
    assert result["ok"] is False


def test_delete_slide_removes_and_reindexes() -> None:
    ctx = Ctx()
    r1 = create_slide(ctx, heading="A", body="", slide_type="content", notes="")
    create_slide(ctx, heading="B", body="", slide_type="content", notes="")
    result = delete_slide(ctx, slide_id=r1["slide_id"])
    assert result["ok"] is True
    assert len(ctx.state["slides"]) == 1
    assert ctx.state["slides"][0]["heading"] == "B"


def test_reorder_slides_reorders() -> None:
    ctx = Ctx()
    r1 = create_slide(ctx, heading="A", body="", slide_type="content", notes="")
    r2 = create_slide(ctx, heading="B", body="", slide_type="content", notes="")
    result = reorder_slides(ctx, slide_ids=[r2["slide_id"], r1["slide_id"]])
    assert result["ok"] is True
    assert ctx.state["slides"][0]["heading"] == "B"
    assert ctx.state["slides"][1]["heading"] == "A"


def test_mark_presentation_ready() -> None:
    ctx = Ctx()
    result = mark_presentation_ready(ctx, summary="Looks good")
    assert result == {"ok": True}
    assert ctx.state["status"] == "ready"
    assert ctx.state["review_summary"] == "Looks good"
