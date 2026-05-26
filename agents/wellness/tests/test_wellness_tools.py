import pytest


@pytest.mark.asyncio
async def test_call_a2a_agent_sends_user_id_metadata(monkeypatch):
    import utils

    captured = {}

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "result": {
                    "task": {
                        "artifacts": [
                            {"parts": [{"text": "delegated plan"}]},
                        ],
                    },
                },
            }

    class Client:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, json):
            captured["url"] = url
            captured["json"] = json
            return Response()

    monkeypatch.setattr(utils.httpx, "AsyncClient", Client)

    text = await utils.call_a2a_agent(
        url="http://agent:8001/",
        prompt="Plan meals",
        user_id="user_123",
        context_id="thread_abc",
    )

    assert text == "delegated plan"
    assert captured["url"] == "http://agent:8001/"
    assert captured["json"]["method"] == "SendMessage"
    assert captured["json"]["params"]["metadata"]["user_id"] == "user_123"
    assert captured["json"]["params"]["message"]["role"] == "ROLE_USER"
    assert captured["json"]["params"]["message"]["contextId"] == "thread_abc"


@pytest.mark.asyncio
async def test_call_a2a_agent_raises_on_rpc_error(monkeypatch):
    import utils

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"error": {"code": -32603, "message": "agent failed"}}

    class Client:
        def __init__(self, timeout):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, json):
            return Response()

    monkeypatch.setattr(utils.httpx, "AsyncClient", Client)

    with pytest.raises(RuntimeError, match="agent failed"):
        await utils.call_a2a_agent(
            url="http://agent:8001/",
            prompt="Plan meals",
            user_id="user_123",
            context_id="thread_abc",
        )
