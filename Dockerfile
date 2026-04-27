FROM python:3.12-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates git && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install trvl binary directly (no Go/brew needed)
RUN curl -L -o /usr/local/bin/trvl https://github.com/MikkoParkkola/trvl/releases/latest/download/trvl-linux-amd64 && \
    chmod +x /usr/local/bin/trvl

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/

WORKDIR /app

COPY agent/ ./

RUN uv pip install --system -e .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
