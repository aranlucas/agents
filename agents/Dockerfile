# syntax=docker/dockerfile:1.7

FROM python:3.14.5-slim AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates gcc python3-dev && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11.19 /uv /usr/local/bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1

COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,id=s/418259b7-9f18-4ba2-81fc-04c1e712b318-agents-uv,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

COPY agents/ ./agents/
RUN --mount=type=cache,id=s/418259b7-9f18-4ba2-81fc-04c1e712b318-agents-uv,target=/root/.cache/uv \
    uv sync --frozen --no-dev

FROM node:24.12.0-slim AS brave-mcp

RUN --mount=type=cache,id=s/418259b7-9f18-4ba2-81fc-04c1e712b318-agents-npm,target=/root/.npm \
    npm install -g @brave/brave-search-mcp-server && \
    npm cache clean --force

FROM python:3.14.5-slim AS runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates nodejs libjemalloc2 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" \
    PORT=8000 \
    PYTHONOPTIMIZE=2 \
    LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2 \
    MALLOC_CONF=background_thread:true,dirty_decay_ms:1000,muzzy_decay_ms:1000 \
    LITELLM_MODE=PRODUCTION \
    LITELLM_LOCAL_MODEL_COST_MAP=false \
    LITELLM_SUPPRESS_DEBUG_INFO=true

COPY --from=brave-mcp /usr/local/lib/node_modules/@brave/brave-search-mcp-server /usr/local/lib/node_modules/@brave/brave-search-mcp-server
RUN ln -s ../lib/node_modules/@brave/brave-search-mcp-server/dist/index.js /usr/local/bin/brave-search-mcp-server

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/agents /app/agents

CMD ["sh", "-c", "uvicorn gateway.main:app --host 0.0.0.0 --port $PORT"]
