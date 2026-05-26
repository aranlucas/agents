from types import SimpleNamespace


def test_remote_a2a_metadata_provider_sends_user_id():
    import main

    invocation_context = SimpleNamespace(
        session=SimpleNamespace(state={"user_id": "user_123"})
    )

    metadata = main._remote_a2a_metadata_provider(invocation_context, object())

    assert metadata == {"user_id": "user_123"}


def test_remote_agent_card_urls_use_well_known_path():
    import main

    assert main._agent_card_url("http://grocery:8001/").endswith(
        "/.well-known/agent-card.json"
    )
    assert main.grocery_remote_agent.name == "grocery_remote_agent"
    assert main.fitness_remote_agent.name == "fitness_remote_agent"
