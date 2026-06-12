import jwt
import pytest
from agent_common.clerk_auth import (
    ClerkAuthMiddleware,
    clerk_auth_enabled,
    decode_clerk_jwt,
)
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def rsa_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _app(decoder):
    app = FastAPI()

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.post("/travel/agui")
    async def travel_agui(request: Request):
        return {"user_id": request.headers.get("x-clerk-user-id")}

    @app.post("/resume/agui")
    async def resume_agui():
        return {"public": True}

    app.add_middleware(ClerkAuthMiddleware, decoder=decoder, public_prefixes=("/resume",))
    return TestClient(app)


def _ok_decoder(token):
    if token != "good-token":
        raise jwt.InvalidTokenError("bad token")
    return {"sub": "user_verified"}


def test_health_bypasses_auth():
    assert _app(_ok_decoder).get("/health").status_code == 200


def test_public_prefix_bypasses_auth():
    assert _app(_ok_decoder).post("/resume/agui").status_code == 200


def test_agui_rejects_missing_token():
    assert _app(_ok_decoder).post("/travel/agui").status_code == 401


def test_agui_rejects_invalid_token():
    response = _app(_ok_decoder).post(
        "/travel/agui",
        headers={"authorization": "Bearer nope"},
    )
    assert response.status_code == 401


def test_agui_rewrites_user_id_header_to_verified_sub():
    response = _app(_ok_decoder).post(
        "/travel/agui",
        headers={
            "authorization": "Bearer good-token",
            "x-clerk-user-id": "user_attacker",
        },
    )
    assert response.status_code == 200
    assert response.json() == {"user_id": "user_verified"}


def test_decode_clerk_jwt_verifies_signature_and_expiry(rsa_key):
    token = jwt.encode(
        {"sub": "user_real", "exp": 4102444800},
        rsa_key,
        algorithm="RS256",
    )
    claims = decode_clerk_jwt(token, signing_key=rsa_key.public_key())
    assert claims["sub"] == "user_real"

    expired = jwt.encode({"sub": "user_real", "exp": 1}, rsa_key, algorithm="RS256")
    with pytest.raises(jwt.ExpiredSignatureError):
        decode_clerk_jwt(expired, signing_key=rsa_key.public_key())


def test_clerk_auth_enabled_follows_env(monkeypatch):
    monkeypatch.delenv("CLERK_JWKS_URL", raising=False)
    assert clerk_auth_enabled() is False
    monkeypatch.setenv(
        "CLERK_JWKS_URL",
        "https://example.clerk.accounts.dev/.well-known/jwks.json",
    )
    assert clerk_auth_enabled() is True
