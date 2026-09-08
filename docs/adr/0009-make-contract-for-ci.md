---
id: 0009
status: ready-for-review
owner: aitutor-architect
inputs: [docs/prd.md, docs/adr/0003-one-typescript-monorepo.md, docs/adr/0004-one-test-runner.md, docs/superpowers/specs/2026-09-08-github-actions-cicd-design.md]
updated: 2026-09-08
---

# ADR 0009 — Continuous integration calls a Make contract, never a toolchain

Promoted from the CI design record at
`docs/superpowers/specs/2026-09-08-github-actions-cicd-design.md`, which was written outside
the architect role and asked for exactly this. That file is now `superseded`.

## Context

The pipeline was built before any code existed — no build command, no test command, nothing
for a gate to check. Writing a toolchain into the workflow files would have decided the stack
inside a continuous-integration task, pre-empting a decision that belongs in an ADR. ADRs 0003
and 0004 have since made that decision properly, and ADR 0004 requires *one* test command at
the repository root.

## Decision

Workflows invoke `make build` and `make test` and nothing else. No language, package manager,
runner or framework is named in any workflow file. The Makefile is the single seam between
the pipeline and the toolchain, which makes `make test` a faithful expression of ADR 0004's
one-root-command requirement rather than a competing one.

## Rejected options

### Write the real toolchain into the workflow files

At the time it required choosing the stack inside a CI task, which is the architect's decision
and belongs in a reviewable record. It also guarantees editing the YAML the first time the
toolchain moves, in a file where a mistake silently disables the gate rather than failing.

### No gate at all until the scaffold lands

Weeks of unguarded merges, and a habit of merging without checks that would then have to be
broken. The document invariants were real enough to gate on in the meantime.

## Consequences

**We accept:** the Make target names are load-bearing and nothing enforces them. Renaming
`test` silently removes the gate rather than breaking it, which is the worst failure shape
available and is why it is warned about in three places. The current targets also check
document invariants rather than software, which is the strongest claim available until spec
`0001` is built — and they must be *swapped*, not merely extended, when it is.

**We gain:** the toolchain decision stayed with the architect. The workflow files never change
when the stack does.

**We will know it was wrong if:** the gate reports green while the build or the tests are
broken.

## Binds

| Requirement ID | How this constrains it |
|---|---|
| 0001 | Must wire `make build` and `make test` to the real toolchain, replacing the document-invariant bodies rather than adding beside them |
| 0002–0009 | Every requirement's tests run through `make test`; none adds a second entry point |
