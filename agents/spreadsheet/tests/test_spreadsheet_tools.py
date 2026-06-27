from spreadsheet_agent.tools.append_rows import append_rows
from spreadsheet_agent.tools.create_sheet import create_sheet
from spreadsheet_agent.tools.delete_sheet import delete_sheet
from spreadsheet_agent.tools.set_active_sheet import set_active_sheet
from spreadsheet_agent.tools.update_sheet import update_sheet
from spreadsheet_agent.tools.write_summary import write_summary


class Ctx:
    def __init__(self, state=None):
        self.state = state or {}


def test_create_sheet_appends_and_sets_index() -> None:
    ctx = Ctx()
    r1 = create_sheet(ctx, title="Sheet1", rows=[["A", "B"], ["1", "2"]])
    assert r1 == {"ok": True, "sheet_index": 0}
    assert ctx.state["active_sheet_index"] == 0
    assert ctx.state["status"] == "ready"

    r2 = create_sheet(ctx, title="Sheet2", rows=[["X"]])
    assert r2 == {"ok": True, "sheet_index": 1}
    assert ctx.state["active_sheet_index"] == 1


def test_update_sheet_replaces_rows() -> None:
    ctx = Ctx()
    create_sheet(ctx, title="Sheet1", rows=[["Old"]])
    result = update_sheet(ctx, sheet_index=0, title="Sheet1", rows=[["New"]])
    assert result == {"ok": True, "sheet_index": 0}
    assert ctx.state["sheets"][0]["rows"] == [["New"]]


def test_update_sheet_out_of_range() -> None:
    ctx = Ctx({"sheets": []})
    result = update_sheet(ctx, sheet_index=5, title="X", rows=[["X"]])
    assert result["ok"] is False


def test_append_rows_extends_existing() -> None:
    ctx = Ctx()
    create_sheet(ctx, title="Data", rows=[["H"]])
    result = append_rows(ctx, sheet_index=0, rows=[["R1"], ["R2"]])
    assert result["ok"] is True
    assert result["total_rows"] == 3
    assert len(ctx.state["sheets"][0]["rows"]) == 3


def test_delete_sheet_removes_and_reindexes() -> None:
    ctx = Ctx()
    create_sheet(ctx, title="A", rows=[])
    create_sheet(ctx, title="B", rows=[])
    result = delete_sheet(ctx, sheet_index=0)
    assert result["ok"] is True
    assert len(ctx.state["sheets"]) == 1
    assert ctx.state["sheets"][0]["title"] == "B"
    assert ctx.state["active_sheet_index"] == 0


def test_set_active_sheet_updates_index() -> None:
    ctx = Ctx()
    create_sheet(ctx, title="A", rows=[])
    create_sheet(ctx, title="B", rows=[])
    result = set_active_sheet(ctx, sheet_index=1)
    assert result == {"ok": True, "active_sheet_index": 1}
    assert ctx.state["active_sheet_index"] == 1


def test_set_active_sheet_out_of_range() -> None:
    ctx = Ctx({"sheets": [{"title": "A", "rows": []}]})
    result = set_active_sheet(ctx, sheet_index=5)
    assert result["ok"] is False


def test_write_summary_sets_summary() -> None:
    ctx = Ctx()
    result = write_summary(ctx, summary="Data analysis complete.")
    assert result["ok"] is True
    assert ctx.state["summary"] == "Data analysis complete."
    assert ctx.state["status"] == "ready"
