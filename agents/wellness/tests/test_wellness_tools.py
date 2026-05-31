from types import SimpleNamespace


def test_remote_a2a_metadata_provider_sends_user_id():
    import main

    invocation_context = SimpleNamespace(
        session=SimpleNamespace(state={"user_id": "user_123"})
    )

    metadata = main._remote_a2a_metadata_provider(invocation_context, object())

    assert metadata == {
        "user_id": "user_123",
        "kroger_access_token": "",
        "strava_access_token": "",
    }


def test_remote_a2a_metadata_provider_sends_auth_tokens():
    import main

    invocation_context = SimpleNamespace(
        session=SimpleNamespace(
            state={
                "user_id": "user_123",
                "temp:kroger_token": "kroger-token",
                "temp:strava_token": "strava-token",
            }
        )
    )

    metadata = main._remote_a2a_metadata_provider(invocation_context, object())

    assert metadata == {
        "user_id": "user_123",
        "kroger_access_token": "kroger-token",
        "strava_access_token": "strava-token",
    }


def test_remote_agent_card_urls_use_well_known_path():
    import main

    assert main._agent_card_url("http://grocery:8001/").endswith(
        "/.well-known/agent-card.json"
    )
    assert main.grocery_remote_agent.name == "grocery_remote_agent"
    assert main.fitness_remote_agent.name == "fitness_remote_agent"


def test_default_state_exposes_per_source_keys_the_ui_reads():
    import main

    # The web/mobile wellness UI renders workout_plan and meal_plan panels and
    # animates a "delegating" status, so those keys must be part of the contract.
    assert "workout_plan" in main._DEFAULT_STATE
    assert "meal_plan" in main._DEFAULT_STATE
    assert main._DELEGATE_OUTPUT_KEYS == {
        "fitness_remote_agent": "workout_plan",
        "grocery_remote_agent": "meal_plan",
    }


def test_before_delegate_tool_marks_delegating_only_for_delegates():
    import main

    state = {"status": "idle"}
    ctx = SimpleNamespace(state=state)

    main.before_delegate_tool(SimpleNamespace(name="get_current_date"), {}, ctx)
    assert state["status"] == "idle"

    main.before_delegate_tool(SimpleNamespace(name="fitness_remote_agent"), {}, ctx)
    assert state["status"] == "delegating"


async def test_capture_delegate_output_writes_workout_plan():
    import main

    state: dict = {}
    ctx = SimpleNamespace(state=state)

    result = await main.capture_delegate_output(
        SimpleNamespace(name="fitness_remote_agent"),
        {},
        ctx,
        "Mon: easy 5k. Tue: strength.",
    )

    assert state["workout_plan"] == "Mon: easy 5k. Tue: strength."
    # Generic per-tool persistence from the shared callback still runs.
    assert state["fitness_remote_agent"] == "Mon: easy 5k. Tue: strength."
    assert result == "Mon: easy 5k. Tue: strength."


async def test_capture_delegate_output_writes_meal_plan():
    import main

    state: dict = {}
    ctx = SimpleNamespace(state=state)

    await main.capture_delegate_output(
        SimpleNamespace(name="grocery_remote_agent"),
        {},
        ctx,
        "Mon dinner: salmon + rice.",
    )

    assert state["meal_plan"] == "Mon dinner: salmon + rice."


async def test_capture_delegate_output_ignores_non_delegate_tools():
    import main

    state: dict = {}
    ctx = SimpleNamespace(state=state)

    await main.capture_delegate_output(
        SimpleNamespace(name="get_current_date"),
        {},
        ctx,
        {"date": "2026-05-31"},
    )

    assert "workout_plan" not in state
    assert "meal_plan" not in state
