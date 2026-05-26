"""Shared ADK tool callbacks."""

from typing import Any, Optional

from google.adk.tools import BaseTool, ToolContext


def parse_tool_response(tool_response: dict | str) -> Optional[dict | str]:
    try:
        if isinstance(tool_response, str):
            return tool_response
        return tool_response.get("structuredContent", tool_response.get("content", {}))
    except KeyError, TypeError, AttributeError:
        return None


def save_state(
    tool_context: ToolContext, tool_name: str, structured_content: Any
) -> None:
    tool_context.state[tool_name] = structured_content


async def shared_after_tool_callback(
    tool: BaseTool,
    args: dict,
    tool_context: ToolContext,
    tool_response: dict,
) -> Optional[dict]:
    if tool.name == "transfer_to_agent":
        return {
            "result": {
                "status": "transferring",
                "agent_name": args.get("agent_name"),
            }
        }

    save_state(tool_context, tool.name, parse_tool_response(tool_response))

    if (
        isinstance(tool_response, dict)
        and "content" in tool_response
        and "structuredContent" in tool_response
    ):
        return {"content": tool_response["content"]}
    return tool_response
