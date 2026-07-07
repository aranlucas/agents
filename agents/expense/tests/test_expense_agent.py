from expense_agent.agent import build_agent, build_eval_agent


def test_expense_runtime_agent_uses_hy3_free_model():
    expense_agent = build_agent()
    assert expense_agent.model.model == "openrouter/tencent/hy3:free"


def test_expense_eval_agent_keeps_paid_mistral_model():
    expense_agent = build_eval_agent()
    assert expense_agent.model.model == "mistral/mistral-small-latest"
