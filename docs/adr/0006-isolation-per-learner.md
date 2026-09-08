---
id: 0006
status: ready-for-review
owner: aitutor-architect
inputs: [docs/prd.md, docs/intents/0002-register-an-account.md, docs/intents/0010-know-its-working.md, CLAUDE.md]
updated: 2026-09-08
---

# ADR 0006 — Isolation per learner at the data layer; the operator reads aggregates

## Context

Two PRD constraints state the boundary: a course belongs to one learner and nobody else reads
their material, and the operator may see learner content only with that learner's consent for
that case, recorded. Requirement 0010's acceptance sets the bar at zero — no place anywhere in
the operator's view where a learner's own words or the contents of their material are
readable. Requirement 0002's intent explains what rests on this: a learner willing to write an
honest, unflattering summary is a learner who believes nobody else will read it.

## Decision

Every stored record carries its owning learner and is reachable only through a path that
asserts that owner; no query shape in the product can return another learner's material. The
operator's view is built from counts and operational events written separately from learner
content, so the view has nothing to leak. Reading content at all requires a consent record
naming the learner, the case and the time, and the read itself is recorded alongside it.

## Rejected options

### Filter by owner in application code over a shared collection

It makes the privacy promise depend on every query ever written being correct, including every
query written in a hurry two years from now. Requirement 0010 sets the bar at zero occurrences,
and no convention-based approach holds a zero over time — one forgotten clause is a breach.

### Give the operator read access and rely on policy

The PRD's promise is that nobody else reads the material. A policy is not a boundary, it is an
intention about a boundary. It would also make the consent record decorative, since the access
it is supposed to gate would already be available.

## Consequences

**We accept:** support becomes harder. Some failures cannot be diagnosed without first asking
the learner for consent, which costs time in exactly the moments a learner is already
frustrated and least inclined to cooperate. Writing operational events separately from content
is also duplicated work at every write.

**We gain:** the privacy promise is structural rather than procedural. Requirement 0010 can be
built at all, because the view it reads from contains nothing that would violate the promise.

**We will know it was wrong if:** operators routinely need consent to resolve ordinary
failures, making the consent path the normal path. That would mean the operational events
carry too little to diagnose with, and the answer is richer events — not wider access.

## Binds

| Requirement ID | How this constrains it |
|---|---|
| 0002 | The account is the owner key every record carries; deletion must remove the records it owns |
| 0010 | The operator's view reads only counts and operational events, never content; consent is a record, not a setting |
| 0004–0009 | Every write carries its owner, and every read asserts it |
