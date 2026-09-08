---
id: 0005
status: approved
owner: aitutor-architect
inputs: [docs/prd.md, docs/intents/0004-capture-a-session.md, docs/intents/0006-ask-my-course.md, docs/intents/0009-know-its-working.md, CLAUDE.md]
updated: 2026-09-08
---

# ADR 0005 — Capture acknowledges first and reads the material afterwards

## Context

Three PRD constraints meet on requirement 0004 and pull the same way. Capture must complete on
a phone, outdoors, on a poor connection. Every act of capture must return something visible
within seconds. Attached material has hard ceilings on size and page count. Requirement 0004's
acceptance puts a number on it: under two minutes, on a deliberately poor connection, and its
intent insists capture must succeed with only a file and nothing written. Reading a document
is driven by page count, which the PRD names as the dominant cost and time factor.

## Decision

A capture is recorded and acknowledged as soon as the material is stored. Reading the material
happens afterwards, outside the learner's request. The session is usable immediately; whether
its material has been read is a property of that material which changes later. Processing
failures are recorded against the material, so requirement 0009 can surface them to the
operator and requirement 0004 can tell the learner what happened and what to do.

## Rejected options

### Read the material before acknowledging the capture

A large document cannot be read inside the two minutes requirement 0004 demands, on the
connection it demands. Worse, a learner who closes the page mid-request loses the capture
entirely — which is the precise failure the whole product exists to prevent. It would make the
product least reliable in the exact moment the PRD identifies as its most important: thirty
seconds after class, in a corridor.

### Read the material on the device before uploading it

A phone in a corridor is the worst available hardware on the worst available connection. It
also moves enforcement of the size and page ceilings to the client, where it cannot be
enforced — so the ceiling becomes a suggestion, and material that exceeds it arrives anyway.

## Consequences

**We accept:** there is a window in which a session exists and its material is not yet
answerable. Requirement 0004's second open question asks what the learner sees during that
window and what they have been promised once they close the page; this ADR deliberately does
not answer it, because it is a spec question for 0004. Requirement 0006 must also decide
whether unprocessed material is excluded from scope silently or reported.

**We gain:** capture latency is independent of document size, so the two-minute measure holds
for a one-page photo and a two-hundred-page deck alike. The ceilings are enforced where they
can be enforced, and can be reported legibly.

**We will know it was wrong if:** learners regularly ask a question against material that has
not finished being read, and interpret the gap as the product being broken rather than as work
in progress.

## Binds

| Requirement ID | How this constrains it |
|---|---|
| 0004 | Capture returns before material is read; the learner must be told something useful in the gap, and told later if it failed |
| 0006 | Scope must account for material not yet readable — excluded, or reported, but never silently treated as read |
| 0008 | Evidence counts must not credit material that failed to process |
| 0009 | Processing failures are operational events, visible to the operator inside 24 hours without being reported |
