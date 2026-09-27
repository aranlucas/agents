export GOMAXPROCS := 2
export GOFLAGS := -p=1

.PHONY: check test build fmt contracts api api-check dev
.NOTPARALLEL:

check:
	golangci-lint run --config=.golangci.yml --concurrency=2 ./...
	test -z "$$(go run mvdan.cc/gofumpt@v0.11.0 -l cmd internal migrations)"
	go vet ./...
	go run ./cmd/contracts -check
	$(MAKE) api-check

test:
	go test -parallel=2 -race ./...

build:
	CGO_ENABLED=0 go build -mod=readonly -trimpath -o bin/agents ./cmd/agents

fmt:
	go run mvdan.cc/gofumpt@v0.11.0 -w cmd internal migrations

contracts:
	go run ./cmd/contracts

api:
	go tool oapi-codegen -config internal/groceryapi/oapi-codegen.yaml api/openapi/grocery-gateway.yaml

api-check:
	@before=$$(mktemp); cp internal/groceryapi/generated.go "$$before"; \
	trap 'rm -f "$$before"' EXIT; \
	$(MAKE) api && diff -u "$$before" internal/groceryapi/generated.go

dev:
	go run ./cmd/agents
