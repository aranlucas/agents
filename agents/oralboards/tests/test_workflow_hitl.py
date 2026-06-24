from ag_ui_adk import AGUIToolset
from oralboards_agent.workflow_agent import _build_case_builder, _build_questioner


def test_workflow_uses_frontend_ask_question_for_readiness_and_answers() -> None:
    case_builder = _build_case_builder()
    questioner = _build_questioner()

    assert "ask_question" in case_builder.static_instruction
    assert "kind='ready'" in case_builder.static_instruction
    assert "adk_request_input" not in case_builder.static_instruction
    assert any(isinstance(tool, AGUIToolset) for tool in case_builder.tools)

    assert "ask_question" in questioner.static_instruction
    assert "kind='answer'" in questioner.static_instruction
    assert "adk_request_input" not in questioner.static_instruction
    assert any(isinstance(tool, AGUIToolset) for tool in questioner.tools)
