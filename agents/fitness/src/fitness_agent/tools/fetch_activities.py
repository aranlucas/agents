import datetime
import logging

import httpx
from agents_shared.state import STRAVA_AUTH
from google.adk.tools import FunctionTool, ToolContext

from ._types import normalize_strava_activity

log = logging.getLogger("fitness_agent")
STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities"


async def fetch_activities(
    tool_context: ToolContext,
    after: int | None = None,
    next_page_token: int | None = None,
) -> dict:
    """Fetch one page of Strava activities (200 per page).

    Pass `after` as a Unix timestamp to limit to activities after that date.
    Pass `next_page_token` from a previous response to fetch the next page —
    omit it (or pass 1) to start from the most recent activities.
    Activities are appended to state across calls so the full history builds up.
    """
    token = str(tool_context.state.get(STRAVA_AUTH.state_key) or "")
    connected = bool(tool_context.state.get("strava_connected")) and bool(token)
    if not connected:
        tool_context.state["status"] = "idle"
        return {
            "ok": False,
            "reason": "strava_not_connected",
            "message": "Connect Strava before syncing activities.",
        }

    tool_context.state["status"] = "syncing"
    page = next_page_token or 1
    params: dict[str, str | int] = {"per_page": 200, "page": page}
    if after is not None:
        params["after"] = after

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                STRAVA_ACTIVITIES_URL,
                headers={"Authorization": f"Bearer {token}"},
                params=params,
            )
            response.raise_for_status()
            batch = response.json()
    except httpx.HTTPStatusError as exc:
        tool_context.state["status"] = "idle"
        status_code = exc.response.status_code
        reason = (
            "strava_unauthorized" if status_code in (401, 403) else "strava_api_error"
        )
        log.exception(
            "fetch_activities: Strava HTTP error status=%s reason=%s",
            status_code,
            reason,
        )
        return {"ok": False, "reason": reason, "status_code": status_code}
    except httpx.HTTPError as exc:
        tool_context.state["status"] = "idle"
        log.exception("fetch_activities: network error")
        return {"ok": False, "reason": "strava_network_error", "message": str(exc)}

    normalized_batch = [normalize_strava_activity(a) for a in batch]
    existing = tool_context.state.get("activities") or []
    all_activities = existing + normalized_batch if page > 1 else normalized_batch
    synced_at = datetime.datetime.now(datetime.UTC).isoformat()

    tool_context.state["activities"] = all_activities
    tool_context.state["activities_synced_at"] = synced_at
    tool_context.state["status"] = "planning"

    has_more = len(batch) == 200
    return {
        "ok": True,
        "count": len(all_activities),
        "synced_at": synced_at,
        "activities": normalized_batch,
        **({"next_page_token": page + 1} if has_more else {}),
    }


tool = FunctionTool(fetch_activities)
