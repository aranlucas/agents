import asyncio
from types import SimpleNamespace

from agents_shared.state import make_state_initializer
from google.adk.tools.function_tool import FunctionTool
from oralboards_agent.agent import (
    OralBoardsState,
    append_exchange,
    build_agent,
    set_case,
    set_phase,
    set_score_card,
)


def test_oralboards_state_tools_write_canvas_state() -> None:
    context = SimpleNamespace(state={})
    sources = [{"docid": 1, "title": "Guide", "collection": "abpd"}]
    citations = [{"docid": 2, "title": "Pulp Therapy", "collection": "aapd"}]

    assert set_case(context, "## Case\nA 7-year-old patient.", sources) == {"ok": True}
    assert context.state["case"] == "## Case\nA 7-year-old patient."
    assert context.state["case_sources"] == sources
    assert context.state["status"] == "presenting"

    assert set_phase(context, "questioning") == {"ok": True, "phase": "questioning"}
    assert context.state["status"] == "questioning"

    assert append_exchange(
        context,
        question="What is your diagnosis?",
        answer="Irreversible pulpitis",
        feedback="Needs source-specific reasoning.",
        citations=citations,
    ) == {"ok": True}
    assert context.state["transcript"] == [
        {
            "question": "What is your diagnosis?",
            "answer": "Irreversible pulpitis",
            "feedback": "Needs source-specific reasoning.",
            "citations": citations,
        },
    ]
    assert context.state["status"] == "questioning"

    assert set_score_card(context, "## Score\n- Diagnosis: 3/4") == {"ok": True}
    assert context.state["score_card"] == "## Score\n- Diagnosis: 3/4"
    assert context.state["status"] == "complete"


def test_state_initializer_preserves_existing_state_and_adds_defaults() -> None:
    """make_state_initializer (replacing on_before_agent) backfills defaults."""
    callback_context = SimpleNamespace(state={"case": "existing"})

    on_before_agent = make_state_initializer(OralBoardsState)
    on_before_agent(callback_context)

    assert callback_context.state["case"] == "existing"
    assert callback_context.state["transcript"] == []
    assert callback_context.state["status"] == "idle"


def test_agent_instruction_uses_adk_state_placeholders() -> None:
    agent = build_agent()
    instruction = agent.instruction

    assert isinstance(instruction, str)
    assert "Current oral-boards state:" in instruction
    assert "{case}" in instruction
    assert "{case_sources}" in instruction
    assert "{status}" in instruction
    assert "{transcript}" in instruction
    assert "{score_card}" in instruction


def test_agent_static_instruction_requires_speaking_questions_before_chat() -> None:
    agent = build_agent()
    static_instruction = agent.static_instruction

    assert isinstance(static_instruction, str)
    assert "ask_question" in static_instruction
    assert "before writing the question in chat" in static_instruction


# ---------------------------------------------------------------------------
# ADK FunctionTool preprocessing for TypedDict-annotated params
# ---------------------------------------------------------------------------


def test_tool_schema_includes_casesource_defs() -> None:
    """ADK emits $defs/CaseSource in the JSON schema for TypedDict params."""
    tool = FunctionTool(func=set_case)
    decl = tool._get_declaration()
    schema = decl.parameters_json_schema or {}
    defs = schema.get("$defs", {})
    cs = defs.get("CaseSource", {})
    assert cs.get("type") == "object"
    assert set(cs.get("required", [])) == {"docid", "filepath", "title", "snippet", "collection"}

    # case_sources is Optional[list[CaseSource]] — should use $ref
    props = schema.get("properties", {})
    assert "$ref" in str(props.get("case_sources", {})) or "CaseSource" in str(
        props.get("case_sources", {})
    )

    # append_exchange should also have citations: list[CaseSource]
    tool2 = FunctionTool(func=append_exchange)
    decl2 = tool2._get_declaration()
    schema2 = decl2.parameters_json_schema or {}
    assert "$defs" in schema2
    props2 = schema2.get("properties", {})
    assert "CaseSource" in str(props2.get("citations", {}))


def test_preprocess_args_preserves_dicts_for_typeddict_params() -> None:
    """ADK _preprocess_args passes plain dicts through for TypedDict types."""
    tool = FunctionTool(func=set_case)
    sources = [
        {"docid": 1, "filepath": "abpd/guide.md", "title": "Guide", "snippet": "...", "collection": "abpd"}
    ]
    args = {"case": "## Case\nA child.", "case_sources": sources}
    processed = tool._preprocess_args(args)

    assert processed["case"] == "## Case\nA child."
    assert processed["case_sources"] == sources
    assert isinstance(processed["case_sources"][0], dict)

    # case_sources is optional — None should pass through cleanly
    args_no_sources = {"case": "## Case\nA child."}
    processed_no = tool._preprocess_args(args_no_sources)
    assert processed_no["case"] == "## Case\nA child."


def test_preprocess_args_preserves_citations_for_append_exchange() -> None:
    """append_exchange citations remain plain dicts through preprocessing."""
    tool = FunctionTool(func=append_exchange)
    citations = [
        {"docid": 2, "filepath": "aapd/pulp.md", "title": "Pulp Therapy", "snippet": "...", "collection": "aapd"}
    ]
    args = {
        "question": "What is your diagnosis?",
        "answer": "Irreversible pulpitis",
        "feedback": "Needs source-specific reasoning.",
        "citations": citations,
    }
    processed = tool._preprocess_args(args)

    assert processed["question"] == "What is your diagnosis?"
    assert processed["citations"] == citations
    assert isinstance(processed["citations"][0], dict)


def test_run_async_with_typeddict_args() -> None:
    """Full FunctionTool.run_async pipeline with plain-dict TypedDict args."""
    tool = FunctionTool(func=set_case)
    context = SimpleNamespace(state={})
    sources = [
        {"docid": 1, "filepath": "abpd/guide.md", "title": "Guide", "snippet": "...", "collection": "abpd"}
    ]

    result = asyncio.run(
        tool.run_async(
            args={"case": "## Test\nContent.", "case_sources": sources},
            tool_context=context,
        )
    )
    assert result == {"ok": True}
    assert context.state["case"] == "## Test\nContent."
    assert context.state["case_sources"] == sources
    assert context.state["status"] == "presenting"
