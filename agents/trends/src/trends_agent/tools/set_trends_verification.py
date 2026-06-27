from google.adk.tools import FunctionTool, ToolContext


def set_trends_verification(tool_context: ToolContext, verification: str) -> dict:
    """Append web-search verification notes to the trends insights in state."""
    existing = str(tool_context.state.get("insights") or "").rstrip()
    section = f"## Verification\n\n{verification}"
    tool_context.state["insights"] = f"{existing}\n\n{section}" if existing else section
    tool_context.state["status"] = "ready"
    return {"ok": True}


tool = FunctionTool(set_trends_verification)
