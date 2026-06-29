from google.adk.tools import FunctionTool, ToolContext

from ._types import Sheet, normalize_sheets


def _state_sheets(tool_context: ToolContext) -> list[Sheet]:
    sheets = normalize_sheets(tool_context.state.get("sheets") or [])
    tool_context.state["sheets"] = sheets
    return sheets


def set_active_sheet(tool_context: ToolContext, sheet_index: int) -> dict[str, object]:
    """Change which sheet tab is currently active."""
    sheets = _state_sheets(tool_context)
    if sheet_index < 0 or sheet_index >= len(sheets):
        return {"ok": False, "error": "sheet_index_out_of_range"}
    tool_context.state["active_sheet_index"] = sheet_index
    return {"ok": True, "active_sheet_index": sheet_index}


tool = FunctionTool(set_active_sheet)
