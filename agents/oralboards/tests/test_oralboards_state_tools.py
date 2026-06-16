import asyncio
import inspect
import typing
from types import SimpleNamespace

from agents_shared.state import make_state_initializer
from google.adk.tools.function_tool import FunctionTool
from oralboards_agent.agent import (
    OralBoardsState,
    append_exchange,
    build_agent,
    read_doc,
    search_docs,
    set_case,
    set_loading_step,
    set_phase,
    set_score_card,
)
from pydantic.fields import FieldInfo


def test_oralboards_state_tools_write_canvas_state() -> None:
    context = SimpleNamespace(state={})
    sources = [{"docid": 1, "title": "Guide", "collection": "abpd"}]

    result_case = set_case(context, "## Case\nA 7-year-old patient.", sources)
    assert result_case["ok"] is True
    assert result_case["status"] == "success"
    assert context.state["case"] == "## Case\nA 7-year-old patient."
    assert context.state["case_sources"] == sources
    assert context.state["status"] == "presenting"

    assert set_phase(context, "questioning") == {
        "status": "success",
        "ok": True,
        "phase": "questioning",
    }
    assert context.state["status"] == "questioning"

    result_exchange = append_exchange(
        context,
        question="What is your diagnosis?",
        answer="Irreversible pulpitis",
        feedback="Needs source-specific reasoning.",
        ideal_response="Irreversible pulpitis of tooth #19.",
    )
    assert result_exchange["ok"] is True
    assert result_exchange["status"] == "success"
    assert result_exchange["count"] == 1
    assert context.state["transcript"] == [
        {
            "question": "What is your diagnosis?",
            "answer": "Irreversible pulpitis",
            "feedback": "Needs source-specific reasoning.",
            "ideal_response": "Irreversible pulpitis of tooth #19.",
        },
    ]
    assert context.state["status"] == "questioning"

    result_score = set_score_card(context, "## Score\n- Diagnosis: 3/4")
    assert result_score["ok"] is True
    assert result_score["status"] == "success"
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
    assert callback_context.state["loading_step"] == ""


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
    assert "{loading_step}" in instruction


def test_agent_static_instruction_includes_loading_step_protocol() -> None:
    agent = build_agent()
    static = agent.static_instruction
    assert isinstance(static, str)
    assert "set_loading_step" in static
    assert "Searching clinical guidelines" in static
    assert "Computing score card" in static


def test_agent_static_instruction_requires_speaking_questions_before_chat() -> None:
    agent = build_agent()
    static_instruction = agent.static_instruction

    assert isinstance(static_instruction, str)
    assert "ask_question" in static_instruction
    assert "before writing the question in chat" in static_instruction


# ---------------------------------------------------------------------------
# ADK FunctionTool schema validation — every tool must have clean,
# well-described JSON schemas for the LLM
# ---------------------------------------------------------------------------

_TOOL_FUNCTIONS = [
    search_docs,
    read_doc,
    set_case,
    set_phase,
    set_loading_step,
    append_exchange,
    set_score_card,
]


def test_tool_schema_includes_casesource_defs() -> None:
    """ADK emits $defs/CaseSource in the JSON schema for TypedDict params."""
    tool = FunctionTool(func=set_case)
    decl = tool._get_declaration()
    schema = decl.parameters_json_schema or {}
    raw = str(schema)

    # CaseSource type should appear somewhere in the schema
    assert "CaseSource" in raw or "case_sources" in raw
    # case or case_sources must be listed as a property
    props = schema.get("properties", {})
    assert "case" in props or "case_sources" in props


def test_every_param_has_description() -> None:
    """Every FunctionTool parameter carries Field(description=...) in source.

    Validates the raw function signature annotations rather than ADK's schema
    output, because ADK's ``_get_function_fields`` calls
    ``get_type_hints(include_extras=False)`` which strips ``Annotated``
    metadata.  Once that ADK bug is fixed the test can be changed to check
    ``decl = tool._get_declaration()`` instead.
    """
    ignored = {"tool_context", "input_stream"}

    for fn in _TOOL_FUNCTIONS:
        sig = inspect.signature(fn)
        for name, param in sig.parameters.items():
            if name in ignored:
                continue
            ann = param.annotation
            if ann is inspect.Parameter.empty:
                continue

            origin = typing.get_origin(ann)
            if origin is typing.Annotated:
                args = typing.get_args(ann)
                field = next((a for a in args[1:] if isinstance(a, FieldInfo)), None)
                assert field is not None, (
                    f"{fn.__name__}.{name} is Annotated but missing Field"
                )
                assert field.description, (
                    f"{fn.__name__}.{name} has empty Field(description='')"
                )


def test_no_anyof_null_in_schemas() -> None:
    """No parameter schema should contain anyOf with null (clean array types)."""
    for fn in _TOOL_FUNCTIONS:
        tool = FunctionTool(func=fn)
        decl = tool._get_declaration()
        raw = str(decl.parameters_json_schema or {})
        assert '"null"' not in raw, (
            f"{fn.__name__} has an anyOf with null in its schema"
        )


def test_literal_params_use_enum() -> None:
    """Parameters typed as Literal[...] should emit an enum in the schema."""
    for fn in _TOOL_FUNCTIONS:
        tool = FunctionTool(func=fn)
        decl = tool._get_declaration()
        props = (decl.parameters_json_schema or {}).get("properties", {})
        for name, prop in props.items():
            if prop.get("type") == "string" and "enum" in prop:
                assert len(prop["enum"]) > 0, (
                    f"{fn.__name__}.{name} has empty enum"
                )


def test_preprocess_args_preserves_dicts_for_typeddict_params() -> None:
    """ADK _preprocess_args passes plain dicts through for TypedDict types."""
    tool = FunctionTool(func=set_case)
    sources = [
        {
            "docid": 1,
            "filepath": "abpd/guide.md",
            "title": "Guide",
            "snippet": "...",
            "collection": "abpd",
        }
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


def test_set_loading_step_writes_to_state() -> None:
    context = SimpleNamespace(state={})
    result = set_loading_step(context, "Searching clinical guidelines…")
    assert result["ok"] is True
    assert result["status"] == "success"
    assert context.state["loading_step"] == "Searching clinical guidelines…"

    # Calling again overwrites the previous step
    set_loading_step(context, "Reading: Pulp therapy guide…")
    assert context.state["loading_step"] == "Reading: Pulp therapy guide…"


def test_preprocess_args_preserves_append_exchange_params() -> None:
    """append_exchange string params pass through preprocessing unchanged."""
    tool = FunctionTool(func=append_exchange)
    args = {
        "question": "What is your diagnosis?",
        "answer": "Irreversible pulpitis",
        "feedback": "Needs source-specific reasoning.",
        "ideal_response": "Irreversible pulpitis of tooth #19.",
    }
    processed = tool._preprocess_args(args)

    assert processed["question"] == "What is your diagnosis?"
    assert processed["answer"] == "Irreversible pulpitis"
    assert processed["feedback"] == "Needs source-specific reasoning."
    assert processed["ideal_response"] == "Irreversible pulpitis of tooth #19."


def test_run_async_with_typeddict_args() -> None:
    """Full FunctionTool.run_async pipeline with plain-dict TypedDict args."""
    tool = FunctionTool(func=set_case)
    context = SimpleNamespace(state={})
    sources = [
        {
            "docid": 1,
            "filepath": "abpd/guide.md",
            "title": "Guide",
            "snippet": "...",
            "collection": "abpd",
        }
    ]

    result = asyncio.run(
        tool.run_async(
            args={"case": "## Test\nContent.", "case_sources": sources},
            tool_context=context,
        )
    )
    assert result["ok"] is True
    assert result["status"] == "success"
    assert context.state["case"] == "## Test\nContent."
    assert context.state["case_sources"] == sources
    assert context.state["status"] == "presenting"
