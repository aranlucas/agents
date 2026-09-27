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

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/agents /app/agents
COPY --from=build /src/assets /app/assets
USER nonroot:nonroot
ENTRYPOINT ["/app/agents"]
