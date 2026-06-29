from google.adk.tools import FunctionTool, ToolContext


def write_itinerary(
    tool_context: ToolContext,
    summary: str,
    body: str,
    flights: str = "",
) -> dict[str, object]:
    """Replace the full multi-day itinerary in shared state.

    `summary` is a 1-2 sentence pitch shown above the day list. `body` is
    the structured plan in markdown — use `## Day 1: <theme>` headings
    followed by `- HH:MM — activity` bullets. Token-streams into the UI.

    `flights` is an optional markdown block with flight details (airline,
    flight numbers, times, prices) that will be rendered in the canvas.
    """
    tool_context.state["itinerary"] = body
    tool_context.state["summary"] = summary
    tool_context.state["status"] = "drafting"
    if flights:
        tool_context.state["flights"] = flights
    return {"ok": True, "length": len(body)}


tool = FunctionTool(write_itinerary)
