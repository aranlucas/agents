from google.adk.tools import ToolContext

from .write_itinerary import write_itinerary


def _write_itinerary(
    tool_context: ToolContext,
    summary: str,
    body: str,
    flights: str = "",
) -> dict[str, object]:
    """Eval compatibility alias for models that mirror underscored stub names."""
    return write_itinerary(tool_context, summary=summary, body=body, flights=flights)
