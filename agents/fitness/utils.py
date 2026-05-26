"""Shared utilities for the fitness agent."""

import os
from typing import Any, Optional

from mcp import StdioServerParameters
from google.adk.tools import BaseTool, ToolContext
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import (
    StdioConnectionParams,
)

BRAVE_SEARCH_MCP_PACKAGE = "@brave/brave-search-mcp-server"


def web_search_toolset() -> McpToolset:
    brave_api_key = os.getenv("BRAVE_API_KEY", "")
    return McpToolset(
        connection_params=StdioConnectionParams(
            server_params=StdioServerParameters(
                command="npx",
                args=[
                    "-y",
                    BRAVE_SEARCH_MCP_PACKAGE,
                    "--brave-api-key",
                    brave_api_key,
                ],
                env={"BRAVE_API_KEY": brave_api_key},
            ),
            timeout=30.0,
        ),
        use_mcp_resources=False,
    )


def parse_tool_response(tool_response: dict | str) -> Optional[dict | str]:
    try:
        if isinstance(tool_response, str):
            return tool_response
        return tool_response.get("structuredContent", tool_response.get("content", {}))
    except (KeyError, TypeError, AttributeError):
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
    save_state(tool_context, tool.name, parse_tool_response(tool_response))

    if (
        isinstance(tool_response, dict)
        and "content" in tool_response
        and "structuredContent" in tool_response
    ):
        return {"content": tool_response["content"]}
    return tool_response


from a2a.helpers import get_message_text, new_task_from_user_message, new_text_part
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.server.tasks import TaskUpdater
from a2a.types import TaskState
from google.adk.runners import Runner
from google.genai import types as genai_types


class ADKAgentExecutor(AgentExecutor):
    """Wraps an ADK Runner as an A2A AgentExecutor."""

    def __init__(self, runner: Runner) -> None:
        self._runner = runner

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        task = context.current_task
        if task is None:
            task = new_task_from_user_message(context.message)
            await event_queue.enqueue_event(task)

        updater = TaskUpdater(
            event_queue=event_queue,
            task_id=task.id,
            context_id=task.context_id,
        )
        await updater.update_status(TaskState.TASK_STATE_WORKING)

        user_id = "demo_user"
        session_id = context.context_id

        existing = await self._runner.session_service.get_session(
            app_name=self._runner.app_name,
            user_id=user_id,
            session_id=session_id,
        )
        if existing is None:
            await self._runner.session_service.create_session(
                app_name=self._runner.app_name,
                user_id=user_id,
                session_id=session_id,
            )

        content = genai_types.Content(
            role="user",
            parts=[genai_types.Part.from_text(text=get_message_text(context.message))],
        )

        reply = ""
        async for event in self._runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=content,
        ):
            if event.is_final_response() and event.content and event.content.parts:
                reply = event.content.parts[0].text or ""
                break

        await updater.add_artifact(parts=[new_text_part(text=reply)])
        await updater.complete()

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        raise NotImplementedError("Cancel not supported")
