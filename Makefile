# nexus-agents — Developer workflow targets
# Issue #1105 — Discoverable CLI wrapper for common tasks
#
# Usage: make help

.PHONY: help setup build test test-watch test-coverage lint lint-fix typecheck \
        dev format doctor fitness clean

# Default target
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ── Setup ────────────────────────────────────────────────────────────────────

setup: ## Install deps, build, and verify
	pnpm install
	pnpm build
	pnpm test

clean: ## Remove build artifacts
	rm -rf packages/*/dist packages/*/node_modules/.cache

# ── Development ──────────────────────────────────────────────────────────────

dev: ## Start dev server
	pnpm dev

build: ## Build all packages
	pnpm build

format: ## Format all files with Prettier
	pnpm format

# ── Testing ──────────────────────────────────────────────────────────────────

test: ## Run all tests
	pnpm test

test-watch: ## Run tests in watch mode (TDD)
	cd packages/nexus-agents && pnpm vitest

test-coverage: ## Run tests with coverage report
	pnpm test:coverage

# ── Linting ──────────────────────────────────────────────────────────────────

lint: ## Lint all files
	pnpm lint

lint-fix: ## Lint and auto-fix
	pnpm lint:fix

typecheck: ## Type-check all packages
	pnpm typecheck

# ── Quality ──────────────────────────────────────────────────────────────────

doctor: ## Check CLI health
	cd packages/nexus-agents && node dist/cli.js doctor

fitness: ## Run fitness audit
	cd packages/nexus-agents && node dist/cli.js fitness-audit
