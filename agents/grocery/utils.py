"""Shared utilities — MCP toolset factory and tool callback."""

import os
from typing import Any, Callable, Dict, Optional

from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.tools import BaseTool, ToolContext
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams

MEAL_PLANNER_MCP_URL = os.getenv(
    "MEAL_PLANNER_MCP_URL", "https://ai-meal-planner-mcp.aranlucas.workers.dev/mcp"
)
KROGER_TOKEN_STATE_KEY = "temp:kroger_token"


def _header_provider(context: ReadonlyContext) -> Dict[str, str]:
    """Return auth headers from session state at call time."""
    token: str = context.state.get(KROGER_TOKEN_STATE_KEY, "")
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}


def meal_planner_toolset() -> McpToolset:
    """MCP toolset for the AI Meal Planner. Auth token is read per-request from state."""
    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url=MEAL_PLANNER_MCP_URL,
            timeout=30.0,
        ),
        header_provider=_header_provider,
        use_mcp_resources=True,
    )


def parse_tool_response(tool_response: dict | str) -> Optional[dict]:
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
