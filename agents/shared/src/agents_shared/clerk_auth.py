"""Clerk session-JWT verification middleware for agent /agui endpoints."""

import functools
import json
import os

import jwt

USER_ID_HEADER = b"x-clerk-user-id"


def clerk_auth_enabled() -> bool:
    return bool(os.getenv("CLERK_JWKS_URL"))


@functools.lru_cache(maxsize=1)
def _jwk_client() -> jwt.PyJWKClient:
    return jwt.PyJWKClient(os.environ["CLERK_JWKS_URL"])


def decode_clerk_jwt(token: str, *, signing_key=None) -> dict[str, object]:
    """Verify signature + expiry and issuer when CLERK_ISSUER is set."""
    if signing_key is None:
        signing_key = _jwk_client().get_signing_key_from_jwt(token).key
    issuer = os.getenv("CLERK_ISSUER")
    return jwt.decode(
        token,
        signing_key,
        algorithms=["RS256"],
        issuer=issuer or None,
        options={"verify_aud": False, "verify_iss": bool(issuer)},
        leeway=5,
    )


def _bearer_token(scope) -> str | None:
    for name, value in scope.get("headers", []):
        if name == b"authorization":
            text = value.decode("latin-1")
            if text.lower().startswith("bearer "):
                return text[7:].strip()
    return None


async def _send_401(send, detail: str) -> None:
    body = json.dumps({"detail": detail}).encode()
    await send(
        {
            "type": "http.response.start",
            "status": 401,
            "headers": [(b"content-type", b"application/json")],
        },
    )
    await send({"type": "http.response.body", "body": body})


class ClerkAuthMiddleware:
    """Pure-ASGI middleware guarding every path that contains "/agui"."""

    def __init__(self, app, *, decoder=decode_clerk_jwt, public_prefixes: tuple[str, ...] = ()):
        self.app = app
        self.decoder = decoder
        self.public_prefixes = public_prefixes

    def _is_protected(self, path: str) -> bool:
        if "/agui" not in path:
            return False
        return not any(path.startswith(prefix) for prefix in self.public_prefixes)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not self._is_protected(scope["path"]):
            return await self.app(scope, receive, send)

        token = _bearer_token(scope)
        if not token:
            return await _send_401(send, "Missing bearer token")
        try:
            claims = self.decoder(token)
        except jwt.PyJWTError:
            return await _send_401(send, "Invalid token")

        sub = str(claims.get("sub") or "")
        if not sub:
            return await _send_401(send, "Token has no subject")

        headers = [(n, v) for n, v in scope["headers"] if n != USER_ID_HEADER]
        headers.append((USER_ID_HEADER, sub.encode("latin-1")))
        scope = {**scope, "headers": headers}
        return await self.app(scope, receive, send)
