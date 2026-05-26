FROM python:3.14.5-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates nodejs npm && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/

WORKDIR /app

COPY . ./

RUN uv pip install --system -e .

EXPOSE 8002

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8002}"]
