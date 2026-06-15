"""Factories for the shared per-agent state patterns.

Every agent declares a pydantic state model; these helpers derive the
backfill callback, the per-turn JSON state instruction, and the request
state extractor from it so agents don't copy the loops around.
"""

from collections.abc import Awaitable, Callable
from typing import NamedTuple

from ag_ui.core.types import RunAgentInput
from fastapi import Request
from google.adk.agents.callback_context import CallbackContext
from pydantic import BaseModel

from .tools import extract_identity_state


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
        state: dict[str, object] = extract_identity_state(request)
        for auth in token_auths:
            token = request.headers.get(auth.header) or ""
            state[auth.connected_flag] = bool(token)
            if token:
                state[auth.state_key] = token
        return state

    return extract
