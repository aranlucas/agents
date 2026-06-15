FROM python:3.14.5-slim AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates gcc python3-dev && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11.19 /uv /usr/local/bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1

COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,id=uv-cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

COPY agents/ ./agents/
RUN uv sync --frozen --no-dev

FROM python:3.14.5-slim AS runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates nodejs npm && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN npm install -g @brave/brave-search-mcp-server

WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" \
    PORT=8000

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/agents /app/agents

CMD ["sh", "-c", "uvicorn gateway.main:app --host 0.0.0.0 --port $PORT"]
