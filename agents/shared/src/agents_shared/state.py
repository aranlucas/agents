"""Factories for the shared per-agent state patterns.

Every agent declares a pydantic state model; these helpers derive the
backfill callback, the per-turn JSON state instruction, and the request
state extractor from it so agents don't copy the loops around.
"""

from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, NamedTuple

from ag_ui.core.types import RunAgentInput
from fastapi import Request
from google.adk.agents.callback_context import CallbackContext
from pydantic import BaseModel

from .tools import extract_identity_state

if TYPE_CHECKING:
    from google.adk.agents.readonly_context import ReadonlyContext


class TokenAuth(NamedTuple):
    """Header → temp-state-key → connected-flag mapping for an OAuth token."""

    header: str
    state_key: str
    connected_flag: str


KROGER_AUTH = TokenAuth(
    "x-kroger-access-token", "temp:kroger_token", "kroger_connected"
)
STRAVA_AUTH = TokenAuth(
    "x-strava-access-token", "temp:strava_token", "strava_connected"
)


def make_state_initializer(
    state_model: type[BaseModel],
    token_flags: dict[str, str] | None = None,
) -> Callable[[CallbackContext], None]:
    """before_agent_callback that backfills model defaults into session state.

    `token_flags` maps a temp-state token key to the connected flag it implies
    (e.g. {"temp:kroger_token": "kroger_connected"}).
    """
    defaults = state_model().model_dump()
    flags = token_flags or {}

    def on_before_agent(callback_context: CallbackContext) -> None:
        for state_key, flag in flags.items():
            if callback_context.state.get(state_key):
                callback_context.state[flag] = True
        for key, default in defaults.items():
            if key not in callback_context.state:
                callback_context.state[key] = default

    return on_before_agent


def make_extract_state(
    *token_auths: TokenAuth,
) -> Callable[[Request, RunAgentInput], Awaitable[dict[str, object]]]:
    """extract_state_from_request handler: Clerk identity + optional token auth."""

    async def extract(
        request: Request, _input_data: RunAgentInput
    ) -> dict[str, object]:
        state: dict[str, object] = dict(extract_identity_state(request))
        for auth in token_auths:
            token = request.headers.get(auth.header) or ""
            state[auth.connected_flag] = bool(token)
            if token:
                state[auth.state_key] = token
        return state

    return extract


def make_state_instruction(
    state_model: type[BaseModel],
    *,
    header: str = "Current state",
) -> str:
    """Generate a per-turn state instruction template from a pydantic model.

    Produces a string like:
        Current state:
        - Field name: {field_name}
        - ...

    Use as the ``instruction`` parameter of LlmAgent to ensure the field list
    stays in sync with the state model automatically.
    """
    lines = [f"{header}:"]
    for field_name in state_model.model_fields:
        label = field_name.replace("_", " ").title()
        lines.append(f"- {label}: {{{field_name}}}")
    return "\n".join(lines)


def make_token_auth_header_provider(
    auth: TokenAuth,
) -> Callable[[ReadonlyContext], dict[str, str]]:
    """Factory for MCP header providers that read an OAuth token from ADK session state.

    The returned function reads ``auth.state_key`` from the session state and
    returns an ``Authorization: Bearer <token>`` header if a token is present.
    """

    def _header_provider(context: ReadonlyContext) -> dict[str, str]:
        token = str(context.state.get(auth.state_key) or "")
        if token:
            return {"Authorization": f"Bearer {token}"}
        return {}

    return _header_provider
