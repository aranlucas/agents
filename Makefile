export GOMAXPROCS := 2
export GOFLAGS := -p=1

.PHONY: check test build fmt contracts api api-check dev railway-link railway-plan railway-apply railway-up

# Railway environment for the railway-* targets: development or production.
ENV ?= development
RAILWAY_PROJECT := cea909d4-f1d8-4bac-b480-c24e98528b5e
RAILWAY_SERVICE := agents-gateway
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

# railway/iac checks the CLI version by running `$$_ --version`; under make,
# $$_ is make itself, so point it at the Railway CLI.
RAILWAY := env _="$$(command -v railway)" railway

railway-link:
	$(RAILWAY) link --project $(RAILWAY_PROJECT) --environment $(ENV) --service $(RAILWAY_SERVICE)

railway-plan: railway-link
	pnpm --dir .railway install --frozen-lockfile
	$(RAILWAY) config plan

# Deleting variables needs CONFIRM_DESTRUCTIVE=1 after reviewing the plan.
railway-apply: railway-link
	pnpm --dir .railway install --frozen-lockfile
	$(RAILWAY) config apply $(RAILWAY_APPLY_FLAGS) $(if $(CONFIRM_DESTRUCTIVE),--confirm-destructive)

# Builds and deploys the local checkout, bypassing the GitHub CI wait.
railway-up: railway-link
	$(RAILWAY) up --service $(RAILWAY_SERVICE) --environment $(ENV) --detach
