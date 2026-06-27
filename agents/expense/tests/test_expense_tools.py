from expense_agent.tools.decide_expense import decide_expense
from expense_agent.tools.set_expense_report import set_expense_report
from expense_agent.tools.submit_expense import submit_expense
from expense_agent.tools.write_expense_review import write_expense_review


class DummyToolContext:
    def __init__(self, state=None):
        self.state = state or {}


def test_low_value_expense_auto_approves():
    ctx = DummyToolContext()

    result = submit_expense(
        tool_context=ctx,
        amount=45.5,
        submitter="alice@example.com",
        category="meals",
        description="Team lunch",
        date="2026-06-18",
    )

    assert result["ok"] is True
    expense = ctx.state["expenses"][0]
    assert expense["status"] == "auto_approved"
    assert expense["id"] == result["expense_id"]
    assert ctx.state["selected_expense_id"] == expense["id"]
    assert ctx.state["status"] == "ready"


def test_high_value_expense_requires_review():
    ctx = DummyToolContext()

    submit_expense(
        tool_context=ctx,
        amount=250,
        submitter="alice@example.com",
        category="travel",
        description="Flight to NYC",
        date="2026-06-18",
    )

    expense = ctx.state["expenses"][0]
    assert expense["status"] == "needs_review"
    assert ctx.state["status"] == "reviewing"


def test_review_updates_risk_fields_and_status():
    ctx = DummyToolContext()
    result = submit_expense(
        tool_context=ctx,
        amount=250,
        submitter="alice@example.com",
        category="travel",
        description="Flight to NYC",
        date="2026-06-18",
    )

    review = write_expense_review(
        tool_context=ctx,
        expense_id=result["expense_id"],
        risk_level="medium",
        risk_summary="Round-trip flight is plausible but needs receipt confirmation.",
        recommendation="approve",
    )

    assert review == {"ok": True, "expense_id": result["expense_id"]}
    expense = ctx.state["expenses"][0]
    assert expense["risk_level"] == "medium"
    assert "receipt" in expense["risk_summary"]
    assert expense["recommendation"] == "approve"
    assert ctx.state["status"] == "needs_approval"


def test_decision_updates_expense():
    ctx = DummyToolContext()
    result = submit_expense(
        tool_context=ctx,
        amount=250,
        submitter="alice@example.com",
        category="travel",
        description="Flight to NYC",
        date="2026-06-18",
    )

    decision = decide_expense(
        tool_context=ctx,
        expense_id=result["expense_id"],
        decision="approved",
        note="Receipt attached.",
    )

    assert decision == {
        "ok": True,
        "expense_id": result["expense_id"],
        "status": "approved",
    }
    expense = ctx.state["expenses"][0]
    assert expense["status"] == "approved"
    assert expense["decision_note"] == "Receipt attached."
    assert ctx.state["status"] == "ready"


def test_set_expense_report_stream_target():
    ctx = DummyToolContext()

    result = set_expense_report(
        tool_context=ctx,
        report="## Expense review\n- 1 approved",
        summary="One expense approved.",
    )

    assert result == {"ok": True, "length": len("## Expense review\n- 1 approved")}
    assert ctx.state["expense_report"].startswith("## Expense review")
    assert ctx.state["review_summary"] == "One expense approved."


def test_expense_register_imports():
    from expense_agent.main import register

    assert callable(register)
