"""Gateway — mounts every agent FastAPI app on one port."""

import logging
import os

from a2ui_agent.main import app as a2ui_app
from agent_common.clerk_auth import ClerkAuthMiddleware, clerk_auth_enabled
from agent_common.session_service import SessionServiceContainer
from dotenv import load_dotenv
from fastapi import FastAPI
from fitness_agent.main import app as fitness_app
from grocery_agent.main import app as grocery_app
from oralboards_agent.main import app as oralboards_app
from travel_agent.main import app as travel_app
from wellness_agent.main import app as wellness_app

load_dotenv()

log = logging.getLogger("gateway")

_session_container = SessionServiceContainer()

app = FastAPI(title="Agents Gateway")

MOUNTS = {
    "/travel": travel_app,
    "/grocery": grocery_app,
    "/fitness": fitness_app,
    "/wellness": wellness_app,
    "/a2ui": a2ui_app,
    "/oralboards": oralboards_app,
}

for prefix, sub_app in MOUNTS.items():
    app.mount(prefix, sub_app)

if clerk_auth_enabled():
    app.add_middleware(ClerkAuthMiddleware, public_prefixes=("/resume",))


@app.get("/health")
async def health():
    # All agents share one session DB; one connectivity check covers them.
    return await _session_container.check_database_connection()


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
