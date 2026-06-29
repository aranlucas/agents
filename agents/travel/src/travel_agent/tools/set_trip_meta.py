from google.adk.tools import FunctionTool, ToolContext


def set_trip_meta(  # noqa: PLR0913
    tool_context: ToolContext,
    destination: str,
    start_date: str,
    end_date: str,
    travelers: int = 1,
    budget_usd: int = 0,
    headline: str = "",
) -> dict[str, object]:
    """Set the high-level trip card (destination, dates, party size, budget).

    Call this FIRST whenever the operator names a new trip. Dates are
    ISO YYYY-MM-DD strings. `headline` is a one-line vibe summary the UI
    pins under the destination ("Snow + sushi + onsen", etc.).
    """
    tool_context.state["destination"] = destination
    tool_context.state["start_date"] = start_date
    tool_context.state["end_date"] = end_date
    tool_context.state["travelers"] = travelers
    tool_context.state["budget_usd"] = budget_usd
    tool_context.state["headline"] = headline
    tool_context.state["status"] = "drafting"
    tool_context.state.setdefault("flights", "")
    return {"ok": True}


tool = FunctionTool(set_trip_meta)
