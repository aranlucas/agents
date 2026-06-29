from google.adk.tools import ToolContext


def create_excalidraw_scene(
    tool_context: ToolContext,
    title: str,
    description: str,
    elements: list[str],
) -> dict[str, object]:
    """Record an eval-safe Excalidraw scene plan in state."""
    scene = {
        "title": title,
        "description": description,
        "elements": elements,
    }
    tool_context.state["scene"] = scene
    return {"status": "created", "scene": scene}
