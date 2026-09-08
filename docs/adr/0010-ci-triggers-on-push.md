---
id: 0010
status: ready-for-review
owner: aitutor-architect
inputs: [docs/prd.md, docs/adr/0009-make-contract-for-ci.md, docs/superpowers/specs/2026-09-08-github-actions-cicd-design.md]
updated: 2026-09-08
---

# ADR 0010 — Continuous integration triggers on push, not on pull request

Promoted from the CI design record at
`docs/superpowers/specs/2026-09-08-github-actions-cicd-design.md`, now `superseded`.

## Context

A pull request opened using the built-in `GITHUB_TOKEN` does not fire `pull_request`
workflows. That guard exists to stop a workflow triggering itself recursively. Because the
auto-PR workflow opens pull requests that way, a `pull_request` trigger would produce pull
requests carrying no checks at all — which the branch ruleset in ADR 0011 would then block
forever, since it requires checks that could never run.

## Decision

Continuous integration triggers on `push`. Required status checks are evaluated against the
pull request's head commit, and check runs attach to that commit regardless of which event
produced them, so a push-triggered run satisfies the gate.

## Rejected options

### Use a personal access token so `pull_request` fires

A long-lived credential stored in a public repository, added to work around a guard that
exists for a good reason. The repository being public removed this from the design space
entirely: the cost of the credential leaking exceeds anything the convenience buys.

### Trigger on both `push` and `pull_request`

Every commit would be checked twice, doubling the run count and the minutes, for one event
that fires only on human-opened pull requests. It also produces two check runs with the same
name on the same commit, which makes required-check matching ambiguous.

## Consequences

**We accept:** pull requests from forks receive no checks and therefore cannot merge. That
fails safe rather than open, and is documented. Separately, the `Sumeria-ltd` organization
forbids Actions from creating pull requests in any repository it owns, and no repository
setting or token scope overrides it — so the auto-PR workflow detects that case, explains it
in the run summary and exits green. The branch still gets its checks; only opening the pull
request is manual. Lifting that is an organization-wide policy change and belongs to an owner
making it deliberately.

**We gain:** no long-lived credential exists in a public repository, so none can leak.

**We will know it was wrong if:** a pull request merges without its checks having run.

## Binds

| Requirement ID | How this constrains it |
|---|---|
| 0001–0009 | Every requirement is delivered on a branch whose checks run from the push, and merged only once they are green |
