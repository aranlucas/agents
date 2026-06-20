"""Spreadsheet ADK agent.

Helps users create and manage data tables (spreadsheets) via a state-first
AG-UI console architecture.
"""

from ag_ui_adk import AGUIToolset
from agents_shared.prompts import canvas_contract
from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_model,
    on_model_error_callback,
)
from google.adk.agents import LlmAgent
from google.adk.tools import ToolContext
from pydantic import BaseModel


class SpreadsheetState(BaseModel):
    sheets: list = []
    active_sheet_index: int = 0
    summary: str = ""
    status: str = "idle"
    review_summary: str = ""
    user_id: str = ""


def _state_sheets(tool_context: ToolContext) -> list:
    existing = tool_context.state.get("sheets")
    if isinstance(existing, list):
        return existing
    tool_context.state["sheets"] = []
    return tool_context.state["sheets"]


def create_sheet(
    tool_context: ToolContext,
    title: str,
    rows: list[list[str]],
) -> dict:
    """Create a new sheet with the given title and rows.

    The first row should be the header row. Appends to the sheets list and
    sets the new sheet as active.
    """
    sheets = _state_sheets(tool_context)
    new_index = len(sheets)
    sheets.append({"title": title, "rows": rows})
    tool_context.state["sheets"] = sheets
    tool_context.state["active_sheet_index"] = new_index
    tool_context.state["status"] = "ready"
    return {"ok": True, "sheet_index": new_index}


def update_sheet(
    tool_context: ToolContext,
    sheet_index: int,
    title: str,
    rows: list[list[str]],
) -> dict:
    """Replace the title and rows of an existing sheet.

    Pass the current title or rows if you only want to change the other.
    """
    sheets = _state_sheets(tool_context)
    if sheet_index < 0 or sheet_index >= len(sheets):
        return {"ok": False, "error": "sheet_index_out_of_range"}
    sheets[sheet_index] = {"title": title, "rows": rows}
    tool_context.state["sheets"] = sheets
    tool_context.state["status"] = "ready"
    return {"ok": True, "sheet_index": sheet_index}


def append_rows(
    tool_context: ToolContext,
    sheet_index: int,
    rows: list[list[str]],
) -> dict:
    """Extend an existing sheet with additional rows."""
    sheets = _state_sheets(tool_context)
    if sheet_index < 0 or sheet_index >= len(sheets):
        return {"ok": False, "error": "sheet_index_out_of_range"}
    sheets[sheet_index]["rows"] = sheets[sheet_index].get("rows", []) + rows
    tool_context.state["sheets"] = sheets
    tool_context.state["status"] = "ready"
    return {"ok": True, "sheet_index": sheet_index, "total_rows": len(sheets[sheet_index]["rows"])}


def delete_sheet(
    tool_context: ToolContext,
    sheet_index: int,
) -> dict:
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


def set_active_sheet(
    tool_context: ToolContext,
    sheet_index: int,
) -> dict:
    """Change which sheet tab is currently active."""
    sheets = _state_sheets(tool_context)
    if sheet_index < 0 or sheet_index >= len(sheets):
        return {"ok": False, "error": "sheet_index_out_of_range"}
    tool_context.state["active_sheet_index"] = sheet_index
    return {"ok": True, "active_sheet_index": sheet_index}


def write_summary(
    tool_context: ToolContext,
    summary: str,
) -> dict:
    """Write a markdown summary or analysis of the spreadsheet data to state."""
    tool_context.state["summary"] = summary
    tool_context.state["status"] = "ready"
    return {"ok": True, "length": len(summary)}


_CANVAS_CONTRACT = canvas_contract(
    artifact="spreadsheet data",
    tools=(
        "create_sheet",
        "update_sheet",
        "append_rows",
        "delete_sheet",
        "set_active_sheet",
        "write_summary",
    ),
)

_INSTRUCTION = (
    """You are a spreadsheet assistant that helps users create and manage data tables.

When a user asks to create a spreadsheet, use `create_sheet` with rows where the
first row is the header. When they ask to add data, use `append_rows`. When they
want to modify existing data, use `update_sheet` (pass current values for any
field you are not changing). When they want analysis or a summary, write it with
`write_summary`.

Formulas are not supported — use actual computed values. Keep data clean: no
commas in numbers (use 1000 not 1,000), no currency symbols unless explicitly
requested.

"""
    + _CANVAS_CONTRACT
    + """
Keep chat concise. The UI renders spreadsheet state live.
"""
)

_STATE_INSTRUCTION = """\
Current spreadsheet state:
- Sheets: {sheets}
- Active sheet index: {active_sheet_index}
- Summary: {summary}
- Status: {status}
- Review summary: {review_summary}
- User ID: {user_id}
"""


def build_agent() -> LlmAgent:
    return LlmAgent(
        name="spreadsheet_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        state_schema=SpreadsheetState,
        static_instruction=_INSTRUCTION,
        instruction=_STATE_INSTRUCTION,
        before_agent_callback=make_state_initializer(SpreadsheetState),
        tools=[
            create_sheet,
            update_sheet,
            append_rows,
            delete_sheet,
            set_active_sheet,
            write_summary,
            AGUIToolset(),
        ],
    )
