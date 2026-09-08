---
id: 0007
status: approved
owner: aitutor-architect
inputs: [docs/prd.md, docs/intents/0006-check-my-summary.md, docs/intents/0007-ask-my-course.md, docs/intents/0008-quiz-me.md, docs/intents/0009-see-my-readiness.md, docs/adr/0001-structural-retrieval.md, docs/adr/0002-citation-validated-against-scope.md, CLAUDE.md]
updated: 2026-09-08
---

# ADR 0007 — One structured model request per learner action; no orchestration loop

## Context

The PRD's Constraints table requires that each learner-facing action be a single structured
request against known material, and separately caps what serving one active learner may cost.
All four model-using requirements — 0006, 0007, 0008, 0009 — act on material the learner has
already chosen, per ADR 0001, so none of them involves open-ended exploration. A third
constraint bears on 0006 specifically: the learner's own account of a session must never be
written for them.

## Decision

Each model-using action is one request that returns a structured payload. No tool-calling
loop, no multi-step agent, no self-critique pass. The payload shape is defined per action, and
for requirement 0006 it returns an assessment of what the learner's summary missed or has
wrong — never prose the learner could paste back as their own summary. Model tier is chosen
per action and recorded in that requirement's spec; the cheaper tier is the default, and using
a more expensive one requires an evaluation showing the cheaper is insufficient.

## Rejected options

### An agent loop that can fetch more material as it reasons

Scope belongs to the learner under ADR 0001. A loop that widens scope on its own breaks that,
and breaks the check in ADR 0002 with it — because the set of documents sent is no longer the
set the learner authorized, so there is nothing stable to validate citations against. It also
makes cost per interaction unbounded, against a PRD constraint that is explicitly financial.

### A fixed multi-pass pipeline — draft, critique, finalise

It multiplies tokens per interaction for every action, and the PRD states that multiplying
tokens per interaction is a business decision rather than a technical one. If an evaluation
later shows one action genuinely needs a second pass, that is a superseding ADR with the
measured numbers attached — not a default applied to all four.

## Consequences

**We accept:** some answers will be worse than a multi-pass pipeline would produce,
particularly on requirement 0006, where the specificity bar is high. A single pass also leaves
less room to recover from a malformed payload than a self-correcting loop would.

**We gain:** cost per interaction is predictable and attributable to an action, which is what
makes requirement 0010's cost-per-learner question answerable at all. Latency is one round
trip. And the response shape for 0006 can be constrained so that producing the learner's
summary is not merely discouraged but structurally unavailable.

**We will know it was wrong if:** a single pass cannot meet requirement 0006's bar — feedback
naming the specific omission and where it lives — or 0008's bar, eight in ten questions
recognised as the learner's own course.

## Binds

| Requirement ID | How this constrains it |
|---|---|
| 0006 | One request; the response carries an assessment, never a model summary the learner could adopt as theirs |
| 0007 | One request; the response carries the structured citations ADR 0002 validates |
| 0008 | One request per practice set, over an enumerated session scope |
| 0009 | One request; evidence is summarised, never predicted as a grade |
| 0010 | Cost must be attributable per action so cost per learner can be reported |
