---
id: 0001
status: approved
owner: aitutor-architect
inputs: [docs/prd.md, docs/intents/0005-capture-a-session.md, docs/intents/0007-ask-my-course.md, docs/intents/0008-quiz-me.md, docs/intents/0009-see-my-readiness.md, CLAUDE.md]
updated: 2026-09-08
---

# ADR 0001 — Retrieval is a scope query over the sessions the learner chose

## Context

Four requirements — 0007, 0008, 0009 and, upstream of them, 0005 — need to select which of
a learner's material answers a given question. The PRD forces the shape of that selection
from two directions at once. Its Constraints table requires structural retrieval over the
learner's own organizing rather than similarity matching over everything they own, and
separately states that cost is driven by how many pages of material enter a request. The
learner has already declared which session each piece of material belongs to, as part of
requirement 0005.

## Decision

Retrieval is a scope query. The learner names the sessions a question is asked against, the
records for those sessions are read directly, and the material they point at goes into the
request as-is. There is no embedding pipeline, no vector index, and no similarity search
anywhere in the product. The set of documents sent is therefore always an enumerable list
that the product constructed from the learner's own choice.

## Rejected options

### A vector database with an embedding pipeline

It replaces the learner's organizing act with machine similarity — and that act is, per the
PRD's thesis, the thing that produces the learning. It would also add an index that has to
stay consistent with material the learner can re-upload or delete, and an embedding cost per
page on top of the per-page request cost the PRD already names as the dominant driver. The
product would still function and would have stopped being this product.

### A managed retrieval or file-search store provided by the model vendor

The same substitution of semantic for structural retrieval, with a worse second effect: it
moves the set of documents that actually answered a question inside a service we cannot
enumerate. That makes the check in ADR 0002 impossible to perform, because we would no
longer know the scope that was sent. The product's one non-negotiable acceptance line
depends on knowing it.

## Consequences

**We accept:** answer quality depends on the learner scoping well. A learner who does not
know which session holds their answer gets a worse result than similarity search would have
given them. Intent 0007's second open question is exactly this, and it stays open.

**We gain:** no index to keep consistent with mutable material. Scope is exactly auditable,
which is what makes ADR 0002 enforceable rather than aspirational. Cost per interaction is
predictable from page count before the request is made.

**We will know it was wrong if:** learners routinely select a scope that does not contain
their answer, so the plain "your material doesn't cover this" response is frequently wrong
rather than accurate — turning requirement 0007's honest-refusal behaviour into a defect.

## Binds

| Requirement ID | How this constrains it |
|---|---|
| 0005 | Assigning material to a session is the index, so it cannot be optional or deferred; a session with unassigned material is unreachable |
| 0007 | Scope is learner-set and must be enumerable at request time; no widening of scope by the product |
| 0008 | Practice is generated from an enumerated session set, which is why single-session practice is as cheap as many |
| 0009 | Evidence for an objective is found by reading the learner's sessions, not by matching text against the objective |
