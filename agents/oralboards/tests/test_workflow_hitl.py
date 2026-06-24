from unittest.mock import MagicMock

import oralboards_agent.workflow_agent as workflow_agent
from google.adk.workflow import START
from oralboards_agent.agent import OralBoardsState


def test_workflow_uses_state_driven_terminal_question_steps() -> None:
    case_builder = workflow_agent._build_case_builder()
    questioner = workflow_agent._build_questioner()

    assert "ask_question" not in case_builder.static_instruction
    assert "set_phase('presenting')" in case_builder.static_instruction

    assert "Return exactly the question text" in questioner.static_instruction
    assert "ask_question" not in questioner.static_instruction
    assert questioner.output_key == "current_question"
    assert questioner.tools == []


def test_workflow_entry_router_resumes_from_shared_state() -> None:
    route = getattr(workflow_agent, "workflow_entry_router", None)
    assert callable(route)

    ctx = MagicMock()
    ctx.state = {"status": "idle"}
    route(ctx)
    assert ctx.route == "build"

    ctx.state = {"status": "questioning", "case": "case"}
    route(ctx)
    assert ctx.route == "question"

    ctx.state = {"status": "feedback", "case": "case"}
    route(ctx)
    assert ctx.route == "evaluate"


def test_completion_flag_is_declared_in_shared_state() -> None:
    assert OralBoardsState().interview_complete is False


def test_workflow_starts_with_entry_router_instead_of_rebuilding_case() -> None:
    workflow = workflow_agent.build_workflow_agent()
    start_edges = [
        edge for edge in workflow.graph.edges if edge.from_node.name == START.name
    ]

    assert [(edge.to_node.name, edge.route) for edge in start_edges] == [
        ("workflow_entry_router", None)
    ]
