"""Shared utilities for the wellness orchestrator agent."""

from __future__ import annotations

import os
from typing import Any, Optional
from uuid import uuid4

import httpx
from a2a.helpers import get_message_text, new_task_from_user_message, new_text_part
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.server.tasks import TaskUpdater
from a2a.types import TaskState
from google.adk.runners import Runner
from google.adk.tools import BaseTool, ToolContext
from google.genai import types as genai_types

GROCERY_AGENT_A2A_URL = os.getenv("GROCERY_AGENT_A2A_URL", "http://localhost:8001/")
FITNESS_AGENT_A2A_URL = os.getenv("FITNESS_AGENT_A2A_URL", "http://localhost:8002/")


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


async def call_a2a_agent(
    *,
    url: str,
    prompt: str,
    user_id: str,
    context_id: str,
) -> str:
    payload = {
        "jsonrpc": "2.0",
        "id": str(uuid4()),
        "method": "SendMessage",
        "params": {
            "message": {
                "role": "ROLE_USER",
                "parts": [{"text": prompt}],
                "messageId": str(uuid4()),
                "contextId": context_id,
            },
            "metadata": {"user_id": user_id},
        },
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()

    data = response.json()
    if "error" in data:
        raise RuntimeError(str(data["error"]))

    result = data.get("result") or {}
    task = result.get("task") or result
    for artifact in task.get("artifacts") or []:
        for part in artifact.get("parts") or []:
            text = part.get("text")
            if text:
                return text
    message = result.get("message") or {}
    for part in message.get("parts") or []:
        text = part.get("text")
        if text:
            return text
    return str(result)


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

        user_id = str(context.metadata.get("user_id") or "anonymous")
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
