from google.adk.tools import FunctionTool, ToolContext

from ._types import Sheet, normalize_sheets


def _state_sheets(tool_context: ToolContext) -> list[Sheet]:
    sheets = normalize_sheets(tool_context.state.get("sheets") or [])
    tool_context.state["sheets"] = sheets
    return sheets


def append_rows(
    tool_context: ToolContext, sheet_index: int, rows: list[list[str]]
) -> dict[str, object]:
    """Extend an existing sheet with additional rows."""
    sheets = _state_sheets(tool_context)
    if sheet_index < 0 or sheet_index >= len(sheets):
        return {"ok": False, "error": "sheet_index_out_of_range"}
    sheets[sheet_index]["rows"] = sheets[sheet_index].get("rows", []) + rows
    tool_context.state["sheets"] = sheets
    tool_context.state["status"] = "ready"
    return {
        "ok": True,
        "sheet_index": sheet_index,
        "total_rows": len(sheets[sheet_index]["rows"]),
    }


tool = FunctionTool(append_rows)
