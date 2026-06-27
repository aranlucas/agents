from google.adk.tools import FunctionTool, ToolContext


def set_research_query(tool_context: ToolContext, title: str, query: str) -> dict:
    """Set the research title and query; initialise status to 'drafting'."""
    tool_context.state["title"] = title
    tool_context.state["query"] = query
    tool_context.state["status"] = "drafting"
    return {"ok": True, "title": title}


tool = FunctionTool(set_research_query)
