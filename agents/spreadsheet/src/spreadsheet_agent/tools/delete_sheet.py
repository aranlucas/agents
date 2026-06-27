from google.adk.tools import FunctionTool, ToolContext


def _state_sheets(tool_context: ToolContext) -> list:
    existing = tool_context.state.get("sheets")
    if isinstance(existing, list):
        return existing
    tool_context.state["sheets"] = []
    return tool_context.state["sheets"]


def delete_sheet(tool_context: ToolContext, sheet_index: int) -> dict:
    """Remove a sheet by index, adjusting the active sheet if needed."""
    sheets = _state_sheets(tool_context)
    if sheet_index < 0 or sheet_index >= len(sheets):
        return {"ok": False, "error": "sheet_index_out_of_range"}
    sheets.pop(sheet_index)
    tool_context.state["sheets"] = sheets
    current_active = int(tool_context.state.get("active_sheet_index", 0))
    if not sheets:
        tool_context.state["active_sheet_index"] = 0
    elif current_active >= len(sheets):
        tool_context.state["active_sheet_index"] = len(sheets) - 1
    elif current_active == sheet_index and sheet_index > 0:
        tool_context.state["active_sheet_index"] = sheet_index - 1
    tool_context.state["status"] = "ready"
    return {"ok": True, "remaining_sheets": len(sheets)}


tool = FunctionTool(delete_sheet)
