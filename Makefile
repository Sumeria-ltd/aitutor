# The build/test contract.
#
# The GitHub Actions workflows call only these targets, and .github/rulesets/main.json
# requires the checks they produce. That indirection is the point: the toolchain for this
# project has not been chosen yet — that is an architecture decision, and it belongs to an
# ADR, not to a CI file. When it is made, replace the *bodies* below and leave the *names*
# alone. Renaming a target silently removes the merge gate.
#
# The bodies now run the real toolchain, as ADR 0009 requires. The document checks were not
# dropped: they became tests inside the suite (tests/docs-invariants.test.ts), because ADR 0009
# says the workflows invoke build and test and nothing else. See docs/ci.md.

BUILD_DIR ?= dist

.DEFAULT_GOAL := help
.PHONY: help build test check clean protect unprotect

help: ## Show the available targets
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | sort | awk -F':.*?## ' '{printf "  %-10s %s\n", $$1, $$2}'

build: ## Assemble the project. Required check on every pull request.
	@npm run build --workspaces --if-present

test: ## Run the automated suite. Required check on every pull request.
	@npx vitest run

check: ## Everything CI runs on a pull request, in one command
	@$(MAKE) --no-print-directory build
	@echo
	@$(MAKE) --no-print-directory test

clean: ## Remove build output
	@rm -rf $(BUILD_DIR)

protect: ## Apply .github/rulesets/main.json to the remote repository
	@scripts/apply-ruleset.sh --apply

unprotect: ## Escape hatch: disable the ruleset when CI itself is broken
	@scripts/apply-ruleset.sh --disable
