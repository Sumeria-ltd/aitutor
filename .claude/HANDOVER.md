<!-- Paste this section into your project's CLAUDE.md, unchanged. -->

## Artifact chain and handover protocol

This project is built by a chain of roles. Each role reads files, writes files, and
stops. **No role calls another role.** The artifact is the interface.

### The chain

```
pitch.txt
   └─ product-manager   → docs/prd.md
                        → docs/intents/NNNN-<slug>.md      (one per requirement)
      └─ product-architect → docs/adr/NNNN-<slug>.md       (decisions, product-wide)
                           → docs/specs/NNNN-<slug>.md     (one per intent, on request)
         └─ product-engineer   → source code and tests
            └─ platform-engineer → deployment.md, live URL
               └─ product-validator → docs/validation/NNNN-<slug>.md
```

`docs/prd.md` is the root document. Every requirement in it has an ID. That ID travels:
requirement `0003` becomes intent `0003`, spec `0003`, validation `0003`. Anything without
a traceable ID does not belong in this repository.

### Every artifact carries a status header

Every generated document starts with this block, and nothing else may precede it:

```yaml
---
id: 0003
status: draft            # draft | ready-for-review | approved | blocked | superseded
owner: product-architect # the role that produced it
inputs: [docs/prd.md, docs/intents/0003-capture-summary.md]
updated: 2026-09-08
---
```

### The handover rules

1. **A role may only start when every input it needs is `approved`.**
   If any input is `draft`, `ready-for-review` or `blocked`, stop and say which file and
   what state it is in. Do not proceed on an unapproved input.

2. **A role may never set its own output to `approved`.**
   When you finish, set `status: ready-for-review` and stop. Approval is a human act.
   This is the gate. Marking your own work approved removes it.

3. **Hand over only when the task is ready.**
   Before setting `ready-for-review`, verify your own skill's "Done when" list and state
   the result item by item. If any item fails, set `status: blocked`, write why under an
   `## Blocked on` heading, and stop.

4. **Unanswered questions block the chain.**
   If you cannot complete the artifact without a decision that is not yours to make, set
   `status: blocked` and list the questions. Never guess and continue.

5. **Stay in your lane.**
   Write only the artifacts your role owns. If you find a fault in an upstream document,
   report it — do not edit it. Corrections go back to the role that owns that file.

6. **Traceability is mandatory.**
   Every artifact names its `inputs` and shares the `id` of the requirement it serves.
   An artifact whose ID appears nowhere upstream is scope drift, and gets reported.

7. **Superseding, never overwriting.**
   When a decision changes, set the old artifact to `superseded`, add
   `superseded-by: <path>`, and write a new one. History is evidence.

### What to say at the end of every run

Finish every run with exactly these four lines:

```
ARTIFACT:  <path you wrote>
STATUS:    ready-for-review | blocked
DONE-WHEN: <each item, met or not met>
NEXT:      <the role that should run next, and what it needs from the human first>
```
