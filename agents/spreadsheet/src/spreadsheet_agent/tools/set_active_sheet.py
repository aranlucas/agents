from google.adk.tools import FunctionTool, ToolContext


def _state_sheets(tool_context: ToolContext) -> list:
    existing = tool_context.state.get("sheets")
    if isinstance(existing, list):
        return existing
    tool_context.state["sheets"] = []
    return tool_context.state["sheets"]


def set_active_sheet(tool_context: ToolContext, sheet_index: int) -> dict:
    """Change which sheet tab is currently active."""
    sheets = _state_sheets(tool_context)
    if sheet_index < 0 or sheet_index >= len(sheets):
        return {"ok": False, "error": "sheet_index_out_of_range"}
    tool_context.state["active_sheet_index"] = sheet_index
    return {"ok": True, "active_sheet_index": sheet_index}


tool = FunctionTool(set_active_sheet)
