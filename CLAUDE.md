# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Pre-implementation. The repository contains `problem.txt` (the original product brief), `docs/PRD.md` (the product requirements), and this file. No code has been scaffolded, so there are no build, test, or lint commands yet — add them here when the project is scaffolded.

## Roles and workflow

This project is built by the five role skills **in this repository** at `.claude/SKILLS/`.
Use those, never the same-named skills in `~/.claude/skills/` — those are a different,
incompatible system that drafts product state into Jira and reads a
`.claude/project-context.md` this project does not have.

> **Name collision, currently unresolved.** Four of the five names are also defined at
> `~/.claude/skills/`, and on a collision the user-level one wins — so invoking
> `product-manager`, `product-architect`, `product-engineer` or `platform-engineer` loads
> the *wrong* skill. Only `product-validator` resolves correctly. Tell them apart by the
> description: the wrong one mentions `.claude/project-context.md`, Jira stories and
> "Ready for Dev". If the wrong one loads, read `.claude/SKILLS/<role>/SKILL.md` directly
> and follow that instead.

| Role | Owns | Never touches |
|---|---|---|
| `product-manager` | `docs/prd.md`, `docs/intents/NNNN-<slug>.md` | architecture, specs, code |
| `product-architect` | `docs/adr/NNNN-<slug>.md`, `docs/specs/NNNN-<slug>.md` | application code |
| `product-engineer` | the code for **one** approved spec | the PRD, the intents, any upstream doc |
| `platform-engineer` | deployment, observability, cost alerting, `deployment.md` | application code, specs |
| `product-validator` | `docs/validation/NNNN-<slug>.md` | everything — it reports, never repairs |

Work flows one direction, and every document carries `status:` frontmatter
(`draft` → `ready-for-review` → `approved`, or `blocked`):

```
PRD → intent → ADR → spec → code → deployment → validation
```

Three rules hold the pipeline together:

- **One requirement, one four-digit ID.** `0001` is assigned in a PRD row and carried
  unchanged through its intent, spec, and validation record.
- **No role approves its own output.** A role sets `ready-for-review`; only the user moves
  a file to `approved`. A role that needs an unapproved input stops and says so.
- **Never choose what to build next.** The architect and engineer act on an intent or spec
  the user names. Picking one is a product decision.

### Handover protocol — the four-line format

Every role ends its turn with exactly these four lines, and nothing else dressed up as them:

```
DONE:   <what was produced, as file paths>
STATE:  <the status set on each file, and what it now waits on>
NEXT:   <which role acts next, and what it needs before it can>
RISK:   <the thing most likely to be wrong, or "none found">
```

The engineer adds a fifth block, `Things I did that the spec did not ask for`, written out
even when it is empty. The validator adds what it did *not* check, and why.

<!-- The four-line format is defined here because all five role skills require it from
     CLAUDE.md and it was previously unspecified anywhere. The skills read whatever this
     section says, so adjust it freely. -->

### Divergences to resolve

The role skills expect filenames this repository does not yet use. Until these are
reconciled, a role will look for a file that is not there:

| Skill expects | Repository has | Note |
|---|---|---|
| `pitch.txt` | `problem.txt` | The original brief. Same role, different name. |
| `docs/prd.md` | `docs/PRD.md` | Differs only in case, so it resolves on macOS but not in git. |
| `docs/intents/` | `docs/intent/` (empty) | Plural vs singular; the old contents are in commit `fe3c550`. |
| Four-digit IDs (`0001`) | `C1`–`C9` in `docs/PRD.md` | The existing PRD uses capability IDs, not numeric ones. |
| "No technology anywhere" in the PRD | `docs/PRD.md` §11 names cost limits and model classes | The project PM skill forbids technology in the PRD; §11 carries it deliberately. |
| `docs/adr/`, `docs/validation/` | absent | Created by the architect and validator on first use. |

## What this is

AITutor is a per-course study space for learners. A learner creates a course, declares its **objectives**, and adds a **session** for each class as it happens, attaching material (slides, PDFs, photos of the board) or writing a summary in their own words. They can then question their own material and get answers cited back to the session they came from, generate practice questions, and see how ready they are against the course objectives.

User: a learner taking a structured course — one that declares what it teaches and happens as sessions over time — wherever it runs (a training provider, a university, a structured online program). The **beachhead** is semester-shaped courses; see `docs/PRD.md` §2 and the open question at §9.1. Positioning: a *co-learner* that runs the whole course loop — prepare, capture, understand, organize, practice — not a document search tool.

## The PRD

`docs/PRD.md` is the source of truth for **what** AITutor is and what it must do: the
problem, the user, the thesis, the five product invariants, the nine v1 capabilities with
their acceptance criteria and out-of-scope lists, the non-goals with their reasons, the
success thresholds, the open questions, and the build phases.

This file is the source of truth for **how** it is built — stack, platform constraints,
model selection, architecture. Where a spec disagrees with the PRD on product intent, the
PRD wins; where the PRD strays into implementation, this file wins.

**Read the relevant capability in the PRD before implementing anything.** Every feature
spec must trace to a capability there.

It supersedes the nine intent files that were at `docs/intent/` (recoverable from commit
`fe3c550`); their content is absorbed into PRD §6, and the traceability table in the PRD
appendix maps each capability back to its origin file.

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
