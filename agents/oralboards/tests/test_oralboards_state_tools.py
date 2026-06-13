from types import SimpleNamespace

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

    assert set_case(context, "## Case\nA 7-year-old patient.", sources) == {
        "ok": True,
        "length": 29,
        "source_count": 1,
    }
    assert context.state["case"] == "## Case\nA 7-year-old patient."
    assert context.state["case_sources"] == sources
    assert context.state["phase"] == "presenting"

    assert set_phase(context, "questioning") == {"ok": True, "phase": "questioning"}
    assert context.state["phase"] == "questioning"

    assert append_exchange(
        context,
        question="What is your diagnosis?",
        answer="Irreversible pulpitis",
        feedback="Needs source-specific reasoning.",
        citations=citations,
    ) == {"ok": True, "count": 1}
    assert context.state["transcript"] == [
        {
            "question": "What is your diagnosis?",
            "answer": "Irreversible pulpitis",
            "feedback": "Needs source-specific reasoning.",
            "citations": citations,
        },
    ]
    assert context.state["phase"] == "feedback"

    assert set_score_card(context, "## Score\n- Diagnosis: 3/4") == {
        "ok": True,
        "length": 25,
    }
    assert context.state["score_card"] == "## Score\n- Diagnosis: 3/4"
    assert context.state["phase"] == "complete"


def test_state_initializer_preserves_existing_state_and_adds_defaults() -> None:
    """make_state_initializer (replacing on_before_agent) backfills defaults."""
    from agents_shared.state import make_state_initializer

    callback_context = SimpleNamespace(state={"case": "existing"})

    on_before_agent = make_state_initializer(OralBoardsState)
    on_before_agent(callback_context)

    assert callback_context.state["case"] == "existing"
    assert callback_context.state["phase"] == "idle"
    assert callback_context.state["transcript"] == []
    assert callback_context.state["status"] == "idle"


def test_agent_instruction_uses_adk_state_placeholders() -> None:
    agent = build_agent()
    instruction = agent.instruction

    assert isinstance(instruction, str)
    assert "Current oral-boards state:" in instruction
    assert "{case}" in instruction
    assert "{case_sources}" in instruction
    assert "{phase}" in instruction
    assert "{transcript}" in instruction
    assert "{score_card}" in instruction
