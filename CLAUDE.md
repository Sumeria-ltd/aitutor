# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Requirement `0001` — register an account — is implemented and merged (PR #2). It is **not
deployed and not validated**: no cloud project exists yet, so `aitutor-platform` has not run,
and the validator needs a deployed URL. The repository is a TypeScript monorepo per ADR 0003 —
`packages/shared`, `apps/api`, `apps/web` — with repository-level checks in `tests/`.

| Command | Does |
|---|---|
| `npm ci` | install; Node 24, pinned in `.nvmrc` |
| `make test` | the whole suite — one Vitest run at the root (ADR 0004), document invariants included |
| `make build` | typecheck every workspace and build the web app |
| `make check` | both, which is what CI runs on a pull request |
| `npm run dev` | API on :8080, web on :5173 |
| `npm run lint` | Biome |

The GitHub Actions workflows call only `make build` and `make test` (ADR 0009). **Renaming a
target removes the merge gate silently** — change the bodies, never the names.
`tests/ci-contract.test.ts` goes red if the workflow stops installing dependencies or a job is
renamed.

## Roles and workflow

This project is built by the five role skills **in this repository** at `.claude/SKILLS/`.
Use those, never the same-named skills in `~/.claude/skills/` — those are a different,
incompatible system that drafts product state into Jira and reads a
`.claude/project-context.md` this project does not have.

> **Why the names carry an `aitutor-` prefix.** `~/.claude/skills/` defines
> `product-manager`, `product-architect`, `product-engineer` and `platform-engineer`, and on
> a name collision the user-level skill wins — so the unprefixed names silently loaded the
> Jira-based role instead of this project's. The prefix makes the collision impossible.
> If a role ever loads talking about `.claude/project-context.md`, Jira epics, or
> "Ready for Dev", it is the wrong skill: stop and read `.claude/SKILLS/<role>/SKILL.md`.

| Role | Owns | Never touches |
|---|---|---|
| `aitutor-pm` | `docs/prd.md`, `docs/intents/NNNN-<slug>.md` | architecture, specs, code |
| `aitutor-architect` | `docs/adr/NNNN-<slug>.md`, `docs/specs/NNNN-<slug>.md` | application code |
| `aitutor-engineer` | the code for **one** approved spec | the PRD, the intents, any upstream doc |
| `aitutor-platform` | deployment, observability, cost alerting, `deployment.md` | application code, specs |
| `aitutor-validator` | `docs/validation/NNNN-<slug>.md` | everything — it reports, never repairs |

## Artifact chain and handover protocol

Reproduced from `.claude/HANDOVER.md`, which instructs that it be pasted here unchanged.
**One deviation:** the role names below carry the `aitutor-` prefix explained above;
`HANDOVER.md` still uses the unprefixed originals. Nothing else is altered.

This project is built by a chain of roles. Each role reads files, writes files, and
stops. **No role calls another role.** The artifact is the interface.

### The chain

```
problem.txt                                              (HANDOVER.md calls this pitch.txt)
   └─ aitutor-pm        → docs/prd.md
                        → docs/intents/NNNN-<slug>.md      (one per requirement)
      └─ aitutor-architect → docs/adr/NNNN-<slug>.md       (decisions, product-wide)
                           → docs/specs/NNNN-<slug>.md     (one per intent, on request)
         └─ aitutor-engineer   → source code and tests
            └─ aitutor-platform → deployment.md, live URL
               └─ aitutor-validator → docs/validation/NNNN-<slug>.md
```

`docs/prd.md` is the root document. Every requirement in it has an ID. That ID travels:
requirement `0003` becomes intent `0003`, spec `0003`, validation `0003`. Anything without
a traceable ID does not belong in this repository.

### Every artifact carries a status header

Every generated document starts with this block, and nothing else may precede it:

```yaml
---
id: 0003
status: draft             # draft | ready-for-review | approved | blocked | superseded
owner: aitutor-architect  # the role that produced it
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

### Document map

| Document | Owner | Status |
|---|---|---|
| `problem.txt` | — | The original brief. This is what the role skills call `pitch.txt`. |
| `docs/prd.md` | `aitutor-pm` | Nine-section PRD, nine ranked requirements `0001`–`0009`; the repository scaffold is a §7 constraint, not a requirement. Carries no technology by design — anything technical a requirement forces is a note for the architect in §7. |
| `docs/intents/NNNN-<slug>.md` | `aitutor-pm` | One per requirement, six fields, countable SUCCESS. |
| `docs/adr/NNNN-<slug>.md` | `aitutor-architect` | Created on first use. One decision per ADR, two rejected options minimum. |
| `docs/specs/NNNN-<slug>.md` | `aitutor-architect` | One per intent, written only when that intent is named to start. |
| `docs/validation/NNNN-<slug>.md` | `aitutor-validator` | Created on first use. |
| `deployment.md` | `aitutor-platform` | Created on first deploy. |

Superseded and removed from the working tree, all recoverable from commit `fe3c550`:
`docs/intent/` (singular — the nine pre-PRD intent files), the nine specs that predated
`docs/prd.md` (reference, not authority; `docs/specs/` now holds only live specs), and the UI
mockups at `design/aitutor-ui/`.

## What this is

AITutor is a per-course study space for learners. A learner creates a course, declares its **objectives**, and adds a **session** for each class as it happens, attaching material (slides, PDFs, photos of the board) or writing a summary in their own words. They can then question their own material and get answers cited back to the session they came from, generate practice questions, and see how ready they are against the course objectives.

User: a learner taking a structured course — one that declares what it teaches and happens as sessions over time — wherever it runs (a training provider, a university, a structured online program). The **beachhead** is semester-shaped courses; see `docs/prd.md` §2 and open question 1. Positioning: a *co-learner* that runs the whole course loop — prepare, capture, understand, organize, practice — not a document search tool.

## The PRD

`docs/prd.md` is the source of truth for **what** AITutor is and what it must do: the
problem, the users, the six journeys, nine ranked requirements `0001`–`0009` with countable
acceptance criteria, out of scope with the reason for each, the constraints table, the
risks with their early signals, the open questions, and the build phases.

This file is the source of truth for **how** it is built — stack, platform constraints,
model selection, architecture. Where a spec disagrees with the PRD on product intent, the
PRD wins; where the PRD strays into implementation, this file wins.

**Read the relevant capability in the PRD before implementing anything.** Every feature
spec must trace to a capability there.

Per-requirement detail lives in `docs/intents/NNNN-<slug>.md`, not in the PRD. The
capability IDs `C1`–`C9` used by the superseded `docs/PRD.md` (commit `116b918`) map one to
one onto `0001`–`0009`; PRD §10 has the table. A scaffold requirement was briefly numbered
`0001` on 2026-09-08 and then made a §7 constraint — see PRD open question 6. The published
PRD artifact predates all of this and still says `C1`–`C9`.

## Product invariants

These are deliberate design decisions, not gaps. Do not "improve" the product by violating them.

- **The learner's effort is the mechanism, not friction.** Finding a resource, assigning it to a session, and putting it in their own words is generative work, and generative work is what produces retention. Never add a feature that removes the learner's summarizing or self-testing work. Automating *transcription* (e.g. extracting objectives from an uploaded syllabus) is fine; automating *comprehension* is not.
- **Effort must pay back immediately and visibly.** The corollary of the above. Every act of capture should return something the learner can see — a check on their summary, a coverage bar moving, a quiz result.
- **Single-user and private.** No shared course spaces, no crowd-sourced material, no social layer. A course belongs to one learner.
- **Answers are grounded in the learner's own material.** Never answer from general model knowledge when the learner is asking about their course. If the scoped material doesn't support an answer, say so.

## Architecture

**Structure replaces retrieval.** There is deliberately no vector database, embedding pipeline, or semantic search. The learner has already told us which session each material belongs to, so retrieval is a scope query (`WHERE session_id IN (...)`) and the selected documents go into context directly. This is both simpler and a truer expression of the product thesis: the learner's organizing effort is literally what makes retrieval work.

**Stack** (all Google Cloud):

| Layer | Choice |
|---|---|
| Frontend | Firebase Hosting |
| Backend | Cloud Run |
| Auth | Firebase Auth |
| Data | Firestore — **one database only**; do not add Cloud SQL alongside it |
| Files | Cloud Storage; the `gs://` URI is stored on the Material record |
| AI | Gemini via Vertex AI |

Cloud Run's service account is the Vertex credential (ADC) — there is no AI API key anywhere in the codebase.

## Platform constraints (verified — do not re-derive)

- **`gs://` URIs are passed directly to Gemini.** Files are never re-uploaded or base64-inlined. Limits: 2 GB via Cloud Storage; PDFs additionally capped at 50 MB and 1,000 pages. The object must live in the same GCP project as the request.
- **PDF pages are billed and tokenized as images** — one page ≈ one image. Page count, not file size, drives cost.
- **Context caching is a per-study-session tool, never semester-long.** Minimum 2,048 tokens; reads cost ~10% of input, but *storage* bills roughly $1/M tokens/hour on Flash-class and ~$4.50 on Pro-class. Create a cache when a study session opens, TTL ~1 hour, let it expire. Caching clearly pays on Flash-class; measure before relying on it with Pro-class.
- **Gemini has no native citation support for arbitrary supplied documents.** `groundingSupports` / `groundingChunks` metadata is built for Google Search grounding and the File Search managed store, not for documents passed in context. Citations here are implemented by us — see below.
- Vertex AI RAG Engine / File Search is the fallback if scope-constrained citation proves insufficient. It is deliberately unused: it substitutes semantic retrieval for the structural retrieval that is the product thesis.

## The citation invariant

Because Gemini won't cite supplied documents for us, citation correctness is enforced in our own code:

1. Every document placed in context is explicitly labelled in the prompt with its session (e.g. `Document 3 = Session 5, Thermodynamics, lecture slides`).
2. The model must return structured JSON containing a `citations[]` array of session IDs and page numbers.
3. **Every returned session ID is validated against the scope set that was actually sent.** An ID outside that set is a hard error — retry, never surface it.

This makes citation accuracy a checkable invariant rather than a hope. Treat step 3 as non-negotiable.

## Scope boundaries for v1

Deliberately excluded — do not implement without an explicit decision to expand scope:

- Sharing, shared course spaces, or any social/collaborative feature
- LMS integration (Moodle/Blackboard/Canvas) — requires an institutional agreement; v1 must stand alone without it
- Lecture audio recording or transcription
- Notifications, streaks, and pre-lecture prompting (the companion layer — a later phase)
- Ads or any revenue mechanics
- Agent frameworks and agentic loops. All five v1 actions (ask, explain, check-my-summary, quiz, coverage) are single structured model calls against known material. None involves open-ended exploration, so an agent loop would add latency, cost, and failure modes for capability that isn't used.

## Model selection

Default to a Flash-class Gemini model; reserve Pro-class for grounded Q&A and explanation, and only after an eval shows Flash-class is insufficient. Pin exact model IDs — the version landscape (3 / 3.1 / 3.5 / 3.6 / 3.7, Flash and Pro) prices very differently and several tiers carry introductory rates. Confirm against Google's official Vertex AI pricing page rather than any figure quoted in project docs.

Unit economics are the reason this product can work at the price points learners will bear (MENA, where the beachhead sits, is the tightest case): Flash-class puts an active learner in roughly the $1–2/month range of model spend. Changes that multiply token usage per interaction are business decisions, not just technical ones.
