# syntax=docker/dockerfile:1.7
FROM golang:1.26.5-bookworm AS build
WORKDIR /src/agents
COPY agents/go.mod agents/go.sum ./
RUN go mod download
COPY agents/ ./
RUN CGO_ENABLED=0 go build -mod=readonly -trimpath -ldflags='-s -w' -o /out/gateway ./cmd/gateway && \
    CGO_ENABLED=0 go build -mod=readonly -trimpath -ldflags='-s -w' -o /out/migrate ./cmd/migrate

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/gateway /app/gateway
COPY --from=build /out/migrate /app/migrate
COPY --from=build /src/agents/assets /app/assets
USER nonroot:nonroot
ENTRYPOINT ["/app/gateway"]
