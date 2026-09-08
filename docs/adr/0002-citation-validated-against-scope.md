---
id: 0002
status: approved
owner: aitutor-architect
inputs: [docs/prd.md, docs/intents/0007-ask-my-course.md, docs/adr/0001-structural-retrieval.md, CLAUDE.md]
updated: 2026-09-08
---

# ADR 0002 — Citation validity is checked by us, against the scope actually sent

## Context

The PRD's Constraints table records that no outside guarantee of citation correctness exists
for a learner's own documents. Requirement 0007's acceptance is unusually absolute: of twenty
questions asked against a chosen scope, the count of answers naming a session outside that
scope must be zero, and the PRD says this is the one number that cannot be rounded. Its
intent explains why the bar is set there — a confidently wrong citation teaches the learner
to stop checking, and checking is where the learning happens. ADR 0001 makes the scope an
enumerable list, which is what makes the check below possible at all.

## Decision

Every document placed in a request is labelled, inside that request, with the session it
belongs to. The model is required to return a structured payload naming the sessions it drew
on. Before anything reaches the learner, every session identifier in that payload is checked
against the set that was sent. An identifier outside the set is a hard failure, not a
warning: retry, and if it recurs, show nothing rather than an unverified answer. An answer
with no attributable session is likewise not shown.

## Rejected options

### Trust the model's own grounding metadata

That metadata exists for vendor-side search and for managed document stores, not for
documents supplied inline in a request — so for our case it is either absent or is not a
guarantee anyone contracted to provide. Building the product's central promise on it means
the promise holds only as long as an undocumented behaviour does.

### Check citations after the fact, by sampling answers for review

By the time a sampled answer is reviewed, the damage is done: one learner has already been
taught that the citations are unreliable. The PRD treats this as a precondition of display,
not a quality metric, and a sampling approach cannot express that difference.

## Consequences

**We accept:** some answers that were in fact correct will be withheld, because the model
named a session badly. Both latency and cost rise on every retry. The learner sometimes sees
nothing where a less careful product would have shown them something plausible.

**We gain:** citation accuracy becomes a property the code enforces rather than a hope, and
requirement 0007's zero-tolerance acceptance line becomes mechanically checkable instead of
a matter of judgement.

**We will know it was wrong if:** the retry rate is high enough that withholding becomes the
normal experience rather than the exception — at which point the problem is the request
shape, not the check.

## Binds

| Requirement ID | How this constrains it |
|---|---|
| 0007 | No answer is displayed until its cited sessions are verified against the sent scope; unverifiable answers are withheld entirely |
| 0006 | Feedback that points at where something lives in a session is subject to the same check |
| 0008 | A question attributed to a session must be attributed to one that was sent |
| 0010 | Retry and withholding counts are operational events the operator must be able to see |
