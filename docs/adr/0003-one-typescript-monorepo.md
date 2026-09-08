---
id: 0003
status: ready-for-review
owner: aitutor-architect
inputs: [docs/prd.md, docs/intents/0001-scaffold-the-repository.md, CLAUDE.md]
updated: 2026-09-08
---

# ADR 0003 — One TypeScript monorepo: a shared package, an API service, a web app

## Context

Requirement 0001 asks for a repository a stranger can clone, install, test and start from
written instructions alone. `CLAUDE.md` already pins where the two surfaces run — the
frontend on Firebase Hosting, the backend on Cloud Run — but says nothing about what language
they are written in or how the repository is laid out. Nothing can be specified for
requirement 0001 until that is decided, and every later requirement inherits the answer.

## Decision

One repository with three workspaces: `packages/shared` for the types and logic both surfaces
need, `apps/api` for the Cloud Run service, and `apps/web` for the Firebase Hosting
application. TypeScript throughout, so the domain types are written once. Exact frameworks
and versions are pinned in spec 0001 after verification against their registries, not in this
ADR — a version recorded here would be stale before it was read.

## Rejected options

### A separate repository per surface

The types that describe a course, a session, a piece of material and a citation are used by
both surfaces. Separate repositories turn that into a published package with its own release
cycle and version skew — a large amount of ceremony for a project with one developer, and a
near-guarantee that the two surfaces drift apart in exactly the place where disagreement is
most expensive.

### One flat application with API and web in a single build

They deploy to different places, run on different runtimes, and scale differently. Collapsing
them means the web build carries server code, and the boundary `CLAUDE.md` draws between
Hosting and Cloud Run stops being visible in the repository — so the next person cannot see
it without being told.

### A different language per surface

The shared domain types are the main reason a monorepo is worth its overhead here. A second
language means maintaining those types twice and reconciling them by hand, which is the
failure the monorepo exists to prevent.

## Consequences

**We accept:** workspace tooling is one more thing a newcomer has to understand, and
requirement 0001's success measure is specifically a newcomer reaching a green test run with
zero steps they had to work out themselves. This decision makes that measure harder to hit.

**We gain:** one definition of the domain for both surfaces. One install, one test command,
one place where a type change surfaces everywhere it matters.

**We will know it was wrong if:** a person who has never built this project cannot get from
clone to passing tests without working something out for themselves — which is requirement
0001's acceptance criterion, measured directly.

## Binds

| Requirement ID | How this constrains it |
|---|---|
| 0001 | Determines the layout, the language and the install surface the spec must describe |
| 0002–0010 | Every later requirement adds to these three workspaces; any new top-level shape needs an ADR superseding this one |
