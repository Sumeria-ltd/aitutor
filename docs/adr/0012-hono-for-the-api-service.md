---
id: 0012
status: approved
owner: aitutor-architect
inputs: [docs/prd.md, docs/adr/0003-one-typescript-monorepo.md, docs/adr/0006-isolation-per-learner.md, docs/specs/0001-register-an-account.md, CLAUDE.md]
updated: 2026-09-08
---

# ADR 0012 — Hono is the web framework for the API service

## Context

ADR 0003 established `apps/api` as the Cloud Run service written in TypeScript, but deferred
naming frameworks to spec `0001` so that no version would go stale inside an ADR. That
deferral had a side effect nobody intended: the API framework became the one stack decision in
this project with no rejected options recorded, and its provenance was a recollection of a
specification that no longer exists. Spec `0001` names Hono in its `STACK` block. This record
gives that choice the scrutiny every other decision here has had.

The service is small and stays small: four routes for requirement `0001`, growing by a handful
per requirement after it. Its one genuinely dangerous piece of code is the middleware that
resolves a token to a learner and confines every handler to that learner's records, because
ADR 0006 sets the count of cross-learner reads at zero.

## Decision

Hono, served on Node by `@hono/node-server`, is the framework for `apps/api`. It is built on
the standard `Request` and `Response` objects, so the shared domain types from
`packages/shared` flow through handlers without translation. The ADR 0006 boundary is written
once as middleware and applied to every route, rather than repeated per handler.

## Rejected options

### Express

Ubiquitous, and every developer has seen it — a real advantage for the stranger PRD §7 counts.
Rejected because its types are retrofitted onto a callback-era API: the shared `Learner` type
cannot flow from `packages/shared` through a handler without casts, which removes a large part
of the reason ADR 0003 chose a monorepo at all. Its middleware signature also makes it easy to
write a route that quietly skips the owner check, and that is the one mistake ADR 0006 cannot
tolerate.

### Fastify

Fast, genuinely well-typed, and its schema layer would be useful later for the structured
payloads ADR 0007 requires. Rejected on weight rather than quality. This service has four
routes; adopting a plugin architecture and a schema compiler for four routes is machinery that
someone must understand before they can change anything, and PRD §7 counts the steps a
newcomer has to work out for themselves.

### Plain `node:http`, no framework

Zero dependencies and the fastest cold start, which matters on Cloud Run. Rejected because
what it makes you hand-roll is routing and middleware — and the middleware here *is* the
privacy boundary. Hand-writing the one piece of code whose failure mode is one learner reading
another's material, in order to save a dependency, is the wrong trade at any size.

## Consequences

**We accept:** a smaller ecosystem than Express, so fewer answers exist when something behaves
oddly. Hono is also designed to run on many runtimes, and carries abstraction for that which
this project will never use — it targets Node on Cloud Run and nothing else.

**We gain:** one auth middleware instead of a check per handler, typed end to end from
`packages/shared`. A small dependency tree, which is not aesthetics on Cloud Run — cold starts
are billed.

**We will know it was wrong if:** the route count grows to where hand-written request
validation on each handler becomes the source of bugs. The answer then is Fastify's schema
layer as a superseding ADR, not validation helpers bolted onto this one.

## Binds

| Requirement ID | How this constrains it |
|---|---|
| 0001 | Defines the API surface and the single place the ADR 0006 owner check lives |
| 0002–0009 | Every later route is added to this service, behind that same middleware |
