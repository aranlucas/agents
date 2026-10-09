# GitHub Actions sets CI=true; let its tools use all available CPUs.
ifneq ($(CI),true)
export GOMAXPROCS ?= 2
export GOFLAGS ?= -p=1
TEST_FLAGS ?= -parallel=2
LINT_FLAGS ?= --concurrency=2
endif

.PHONY: check test build vuln fmt contracts dev dev-portless recall railway-link railway-plan railway-apply railway-up

# Railway environment for the railway-* targets: development or production.
ENV ?= development
RAILWAY_PROJECT := cea909d4-f1d8-4bac-b480-c24e98528b5e
RAILWAY_SERVICE := agents-gateway
.NOTPARALLEL:

check:
	golangci-lint run --config=.golangci.yml $(LINT_FLAGS) ./... ./.railway
	go run ./cmd/contracts -check

test:
	go test $(TEST_FLAGS) -race ./... ./.railway

build:
	CGO_ENABLED=0 go build -mod=readonly -trimpath -o bin/agents ./cmd/agents

vuln:
	go run golang.org/x/vuln/cmd/govulncheck@v1.7.0 ./...

fmt:
	golangci-lint fmt --config=.golangci.yml ./... ./.railway

contracts:
	go run ./cmd/contracts

dev:
	go run ./cmd/agents

# Optional named HTTPS URL; the gateway already reads the injected PORT.
dev-portless:
	portless run --name agents go run ./cmd/agents

# Live provider evaluation; uses synthetic facts and writes artifacts/recall.
recall:
	go run ./cmd/evalrun -recall $(RECALL_FLAGS)

RAILWAY := railway

railway-link:
	$(RAILWAY) link --project $(RAILWAY_PROJECT) --environment $(ENV) --service $(RAILWAY_SERVICE)

railway-plan: railway-link
	$(RAILWAY) config plan

# Deleting variables needs CONFIRM_DESTRUCTIVE=1 after reviewing the plan.
railway-apply: railway-link
	$(RAILWAY) config apply $(RAILWAY_APPLY_FLAGS) $(if $(CONFIRM_DESTRUCTIVE),--confirm-destructive)

# Builds and deploys the local checkout, bypassing the GitHub CI wait.
railway-up: railway-link
	$(RAILWAY) up --service $(RAILWAY_SERVICE) --environment $(ENV) --detach
