from google.adk.tools import FunctionTool, ToolContext

from ._types import Sheet, normalize_sheets


def _state_sheets(tool_context: ToolContext) -> list[Sheet]:
    sheets = normalize_sheets(tool_context.state.get("sheets") or [])
    tool_context.state["sheets"] = sheets
    return sheets


def create_sheet(
    tool_context: ToolContext, title: str, rows: list[list[str]]
) -> dict[str, object]:
    """Create a new sheet. First row should be the header."""
    sheets = _state_sheets(tool_context)
    new_index = len(sheets)
    sheets.append({"title": title, "rows": rows})
    tool_context.state["sheets"] = sheets
    tool_context.state["active_sheet_index"] = new_index
    tool_context.state["status"] = "ready"
    return {"ok": True, "sheet_index": new_index}


tool = FunctionTool(create_sheet)
