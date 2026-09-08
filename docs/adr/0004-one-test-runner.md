---
id: 0004
status: approved
owner: aitutor-architect
inputs: [docs/prd.md, docs/adr/0003-one-typescript-monorepo.md]
updated: 2026-09-08
---

# ADR 0004 — One test runner across every workspace, and tests that cross real seams

## Context

A suite which passes against a broken project is worse than no suite, because it is trusted.
How much must exist for one to be meaningful depended on architecture decisions not yet made;
ADR 0003 has now made them — three workspaces, one language. PRD §7 also asks for *one* agreed
way to run the tests, which rules out the obvious per-workspace answer.

> The "worse than no suite" reasoning came from the removed intent 0001, whose LIMITS
> stated it directly. PRD §7 records the countable bar but not this rationale. The intent is
> at `git show c2e1fc9:docs/intents/0001-scaffold-the-repository.md`.

## Decision

Vitest is the single runner for all three workspaces, invoked by one command at the repository
root. Configuration may differ per workspace, because a browser-shaped application and a
server are genuinely different environments, but the command the reader types does not. The
initial suite must cross at least one real boundary in each workspace — a value defined in
`packages/shared` and consumed by both `apps/api` and `apps/web` — rather than assert a
constant against itself.

## Rejected options

### A separate runner per workspace, each with its own command

PRD §7 asks for one agreed way to run the tests. Three commands is three ways, and
a newcomer has to discover which one applies to the change they just made. That is precisely
the "step you had to work out yourself" that PRD §7 counts and requires to be zero.

### A smoke test that asserts the runner runs

It passes against a broken project, which is the exact failure the §7 constraint exists to prevent. A green
suite would then carry no information, and would be trusted anyway — the worst of the
available outcomes.

## Consequences

**We accept:** one runner has to serve both a browser-shaped application and a server, so some
configuration is duplicated per workspace even though the entry point is shared. The
cross-workspace test also couples the three packages at test time, so a breaking change in
`packages/shared` fails the suite in two places rather than one.

**We gain:** "does this change work?" has one mechanical answer, available to a newcomer
without instruction. The wiring between the three workspaces is proven by the suite rather
than assumed.

**We will know it was wrong if:** the suite passes while the product is visibly broken — which
would be found by the validator, late, and would mean the seams chosen were not real ones.

## Binds

| Requirement ID | How this constrains it |
|---|---|
| PRD §7 constraint | Fixes the runner, the single root command, and the requirement that initial tests cross a real boundary |
| 0001–0009 | Every later requirement's ACCEPT lines are tested through this runner; the engineer writes a failing test per ACCEPT line before implementing |
