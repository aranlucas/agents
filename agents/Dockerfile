# syntax=docker/dockerfile:1.7
FROM golang:1.26-bookworm AS build
WORKDIR /src/agents
COPY agents/go.mod agents/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY agents/ ./
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/gateway ./cmd/gateway

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/gateway /app/gateway
COPY --from=build /src/agents/assets /app/assets
USER nonroot:nonroot
ENTRYPOINT ["/app/gateway"]
