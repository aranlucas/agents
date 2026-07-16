# syntax=docker/dockerfile:1.7
FROM golang:1.26.5-bookworm AS build
WORKDIR /src/agents
COPY agents/go.mod agents/go.sum ./
RUN --mount=type=cache,id=s/418259b7-9f18-4ba2-81fc-04c1e712b318-/go/pkg/mod,target=/go/pkg/mod \
    go mod download
COPY agents/ ./
RUN --mount=type=cache,id=s/418259b7-9f18-4ba2-81fc-04c1e712b318-/go/pkg/mod,target=/go/pkg/mod \
    --mount=type=cache,id=s/418259b7-9f18-4ba2-81fc-04c1e712b318-/root/.cache/go-build,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -mod=readonly -trimpath -ldflags='-s -w' -o /out/ ./cmd/gateway ./cmd/migrate

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/gateway /app/gateway
COPY --from=build /out/migrate /app/migrate
COPY --from=build /src/agents/assets /app/assets
USER nonroot:nonroot
ENTRYPOINT ["/app/gateway"]
