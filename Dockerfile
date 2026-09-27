# syntax=docker/dockerfile:1.7
FROM golang:1.27.1-bookworm AS build
WORKDIR /src
ENV GOMAXPROCS=2 GOFLAGS=-p=1
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -mod=readonly -trimpath -ldflags='-s -w' -o /out/agents ./cmd/agents
# SQLite lives in /app/.data. Railway mounts a volume there; without one the
# directory must still be writable by the non-root user.
RUN mkdir -p /out/data

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/agents /app/agents
COPY --from=build /src/assets /app/assets
COPY --from=build --chown=65532:65532 /out/data /app/.data
USER nonroot:nonroot
ENTRYPOINT ["/app/agents"]
