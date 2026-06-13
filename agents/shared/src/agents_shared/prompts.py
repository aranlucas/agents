"""Reusable prompt contracts for agent UX consistency."""

CANVAS_CONTRACT_MARKER = "## UI canvas contract"


def canvas_contract(*, artifact: str, tools: tuple[str, ...]) -> str:
    tool_list = ", ".join(f"`{tool}`" for tool in tools)
    return f"""\
{CANVAS_CONTRACT_MARKER}
The UI canvas/state is the source of truth for the {artifact}. Never paste the full {artifact} into chat; use {tool_list} to write it to state so the UI can render it.
After each state write, keep chat to 1-2 sentences: say what changed and offer one concrete next step.
"""
