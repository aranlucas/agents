"""Per-invocation temp-state bridge for in-process sub-agents.

ADK's AgentTool runs a child agent in a fresh session whose state copy strips
`temp:` keys. The orchestrator's session service stashes those keys in this
contextvar (inherited by the child's async context), and child toolsets read
them via get_invocation_temp as a fallback to their own session state.
"""

import contextvars

_invocation_temp_state: contextvars.ContextVar[dict | None] = contextvars.ContextVar(
    "_invocation_temp_state",
    default=None,
)


def set_invocation_temp_state(temp: dict | None) -> None:
    _invocation_temp_state.set(temp)


def get_invocation_temp(key: str, state) -> str:
    """Read `key` from session state, falling back to the invocation contextvar."""
    if state:
        value = state.get(key)
        if value:
            return str(value)
    fallback = _invocation_temp_state.get() or {}
    return str(fallback.get(key) or "")
