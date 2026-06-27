from google.adk.tools import FunctionTool, ToolContext


def add_day(tool_context: ToolContext, day_number: int, theme: str, plan: str) -> dict:
    """Append (or replace) a single day in the existing itinerary.

    `plan` should be a list of `- HH:MM — activity` bullets. Use this for
    incremental edits when the operator asks to add or rework one day
    rather than the whole trip.
    """
    current = tool_context.state.get("itinerary", "") or ""
    sep = "\n\n" if current.strip() else ""
    block = f"{sep}## Day {day_number}: {theme}\n\n{plan}"
    tool_context.state["itinerary"] = current + block
    tool_context.state["status"] = "drafting"
    return {"ok": True}


tool = FunctionTool(add_day)
