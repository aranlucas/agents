from google.adk.tools import FunctionTool, ToolContext


def _state_sheets(tool_context: ToolContext) -> list:
    existing = tool_context.state.get("sheets")
    if isinstance(existing, list):
        return existing
    tool_context.state["sheets"] = []
    return tool_context.state["sheets"]


def update_sheet(
    tool_context: ToolContext,
    sheet_index: int,
    title: str,
    rows: list[list[str]],
) -> dict:
    """Replace the title and rows of an existing sheet."""
    sheets = _state_sheets(tool_context)
    if sheet_index < 0 or sheet_index >= len(sheets):
        return {"ok": False, "error": "sheet_index_out_of_range"}
    sheets[sheet_index] = {"title": title, "rows": rows}
    tool_context.state["sheets"] = sheets
    tool_context.state["status"] = "ready"
    return {"ok": True, "sheet_index": sheet_index}


tool = FunctionTool(update_sheet)
