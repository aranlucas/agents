from types import SimpleNamespace


def test_remote_a2a_metadata_provider_sends_user_id() -> None:
    from wellness_agent import main

    token = main._invocation_temp_state.set(None)
    invocation_context = SimpleNamespace(
        session=SimpleNamespace(state={"user_id": "user_123"}),
    )
    try:
        metadata = main._remote_a2a_metadata_provider(invocation_context, object())
    finally:
        main._invocation_temp_state.reset(token)
    assert metadata == {
        "user_id": "user_123",
        "kroger_access_token": "",
        "strava_access_token": "",
    }


def test_remote_a2a_metadata_provider_sends_auth_tokens() -> None:
    from wellness_agent import main

    invocation_context = SimpleNamespace(
        session=SimpleNamespace(
            state={
                "user_id": "user_123",
                "temp:kroger_token": "kroger-token",
                "temp:strava_token": "strava-token",
            },
        ),
    )
    metadata = main._remote_a2a_metadata_provider(invocation_context, object())
    assert metadata == {
        "user_id": "user_123",
        "kroger_access_token": "kroger-token",
        "strava_access_token": "strava-token",
    }


def test_remote_agent_card_urls_use_well_known_path() -> None:
    from wellness_agent import main

    assert main._agent_card_url("http://grocery:8001/").endswith(
        "/.well-known/agent-card.json",
    )
    assert main.grocery_remote_agent.name == "grocery_remote_agent"
    assert main.fitness_remote_agent.name == "fitness_remote_agent"
