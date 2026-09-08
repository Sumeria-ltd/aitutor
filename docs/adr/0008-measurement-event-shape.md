---
id: 0008
status: approved
owner: aitutor-architect
inputs: [docs/prd.md, docs/intents/0009-know-its-working.md, docs/adr/0006-isolation-per-learner.md, CLAUDE.md]
updated: 2026-09-08
---

# ADR 0008 — One event shape, emitted by the requirement that causes it

## Context

PRD §10 states the problem exactly: requirement `0009` is built last, but the signals it
reports must be emitted from the first commit onward or the first cohort produces no answers.
Intent `0009`'s first open question asks whether that obligation belongs to each earlier
requirement as it ships, or to a slice ahead of them. The user answered: each requirement
emits its own.

That answer is only safe if the shape is fixed once. Nine specs each inventing an event
format produces nine formats, and an operator view that cannot be built over them. ADR 0006
adds a hard constraint: operational records are written separately from learner content, and
requirement `0009`'s acceptance sets the count of places learner words are readable at zero.

## Decision

One append-only event stream. Every event carries exactly five things: a stable dotted `name`,
an `occurred_at` timestamp, the owning `learner`, the four-digit `requirement` that emitted it,
and `attributes` — a flat map of scalars.

`attributes` may hold counts, durations, money, enum outcomes, and identifiers of the
learner's own records. It may **never** hold text the learner wrote, filenames they chose, or
any content of their material. This is checked, not merely documented.

An event is written as part of the same write that records the change it describes, so an
event cannot exist for a change that did not happen, nor a change go unrecorded. Every
model-using action carries its cost as an attribute, which is what makes requirement `0009`'s
cost-per-learner question answerable at all.

Event names live in one registry that the test suite asserts against. A spec that needs a new
event adds it there, so drift across nine specs is a failing test rather than a discovery.

## Rejected options

### Let each spec define the events it needs

It is the cheapest thing to write and the most expensive thing to have written. Nine specs
would produce nine shapes, differing in how they name a learner, whether they timestamp at
write or at request, and what counts as an outcome. Requirement `0009` would then be an
integration project across nine formats rather than a reading exercise, and it is scheduled
last precisely because it is meant to be cheap by then.

### Derive the numbers from application records at query time, with no events

Most of the signals in PRD §8 are about behaviour over time — did this learner come back and
check a second summary within seven days, is capture still happening in week four. Current-state
records answer "what exists now", not "what happened when". Reconstructing the second from the
first would mean reading the learner's own material and summaries to infer activity, which ADR
0006 forbids and requirement `0009` counts at zero.

## Consequences

**We accept:** every spec from `0001` onward carries work that pays back nothing until `0009`
is built. A forgotten event stays invisible until then, and by the time it is missed the
cohort that would have produced its data has already gone. The registry is one more file that
must be kept honest.

**We gain:** the two existential risks in PRD §8 — capture surviving week three, and the
summary loop repeating — become measurable during the first cohort, which is the only cheap
opportunity to answer them. `0009` becomes a view over a known shape rather than an archaeology
project.

**We will know it was wrong if:** `0009` is built and the events cannot answer the risks in
PRD §8 without backfilling data that no longer exists.

## Binds

| Requirement ID | How this constrains it |
|---|---|
| 0001 | Emits the first events, and establishes the registry and the content check the other eight inherit |
| 0002–0008 | Each emits the events its own behaviour produces, in this shape, in the same write |
| 0009 | Reads this stream and nothing else; it adds no new source |
