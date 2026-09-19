# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Requirement `0001` — register an account — is implemented and merged (PR #2). It is **not
deployed and not validated**: no cloud project exists yet, so `aitutor-platform` has not run,
and the validator needs a deployed URL. The repository is a TypeScript monorepo per ADR 0003 —
`packages/shared`, `apps/api`, `apps/web` — with repository-level checks in `tests/`.

**Since 2026-09-12 the requirement chain lives in Atlassian, not in `docs/`.** The PRD, the
nine intents, the twelve ADRs and spec 0001 are pages in the Confluence space `AI`; the work
is epics, stories and chain tasks in the Jira project `AIT`. `.claude/ATLASSIAN.md` is the map.
The document-invariant checks that guarded `docs/` were retired with it.

| Command | Does |
|---|---|
| `npm ci` | install; Node 24, pinned in `.nvmrc` |
| `make test` | the whole suite — one Vitest run at the root (ADR 0004), the CI-contract check included |
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
incompatible system that reads a `.claude/project-context.md` this project does not have
and uses Jira statuses like "Ready for Dev" that this project does not.

> **Why the names carry an `aitutor-` prefix.** `~/.claude/skills/` defines
> `product-manager`, `product-architect`, `product-engineer` and `platform-engineer`, and on
> a name collision the user-level skill wins — so the unprefixed names silently loaded the
> other system's role instead of this project's. The prefix makes the collision impossible.
> If a role ever loads talking about `.claude/project-context.md` or "Ready for Dev", it is
> the wrong skill: stop and read `.claude/SKILLS/<role>/SKILL.md`.

The roles cooperate only through Atlassian: **Confluence for knowledge, Jira for work.**
Every role reads `.claude/ATLASSIAN.md` before starting, and stops if the Atlassian MCP is
not connected.

| Role | Owns (Confluence space `AI`) | Works (Jira `AIT`) | Never touches |
|---|---|---|---|
| `aitutor-pm` | `PRD — AITutor`, `Intent NNNN · …` | creates the epic, stories and chain tasks per requirement | architecture, specs, code |
| `aitutor-architect` | `ADR NNNN · …`, `Spec NNNN · …`, `Architecture Overview` | `NNNN · Spec` | application code |
| `aitutor-engineer` | the code for **one** approved spec, as one pull request | `NNNN · Implement` | the PRD, the intents, any upstream page |
| `aitutor-platform` | `Deployment` | `NNNN · Deploy` | application code, specs |
| `aitutor-validator` | `Validation NNNN · …` | `NNNN · Validate` | everything — it reports, never repairs |

Three third-party **design** skills sit beside the role skills: `teach-impeccable`,
`frontend-design` and `critique`, from Impeccable (Apache-2.0), pinned and documented in
`.claude/SKILLS/IMPECCABLE.md`. They are not roles and move nothing in Jira. `frontend-design`
guides how UI is built and `critique` reviews it; both read the design context that
`teach-impeccable` writes once to `.impeccable.md` at the repository root. `aitutor-engineer`
applies `frontend-design` when a spec touches `apps/web`.

## Artifact chain and handover protocol

This project is built by a chain of roles. Each role reads pages, writes pages, moves its
Jira task, and stops. **No role calls another role.** The artifact is the interface.

Knowledge lives in the Confluence space `AI`; work lives in the Jira project `AIT`; the
code lives in this repository. `.claude/ATLASSIAN.md` holds the page tree, the title and
label conventions, the Jira conventions and the ID map. Every role reads it before
starting. **If the Atlassian MCP is not connected, stop and say so** — there is no file
fallback.

### The chain

```
problem.txt (the brief)
   └─ aitutor-pm        → Confluence: PRD — AITutor
                        → Confluence: Intent NNNN · <title>          (one per requirement)
                        → Jira: the epic, its stories, its four chain tasks
      └─ aitutor-architect → Confluence: ADR NNNN · <decision>       (decisions, product-wide)
                           → Confluence: Spec NNNN · <title>         (one per intent, on request)
                           → Confluence: Architecture Overview       (kept current)
         └─ aitutor-engineer   → this repository: code and tests, one pull request per spec
            └─ aitutor-platform → Confluence: Deployment, and the live URL
               └─ aitutor-validator → Confluence: Validation NNNN · <title>
```

The PRD page is the root document. Every requirement in it has an ID. That ID travels:
requirement `0003` becomes intent `0003`, spec `0003`, validation `0003`, epic
`0003 · <title>`. Anything without a traceable ID does not belong in this project.

### Every artifact page carries a status header

Every artifact page begins with this table, and nothing may precede it:

```markdown
| | |
|---|---|
| **id** | 0003 |
| **status** | `draft` |                    draft | ready-for-review | approved | blocked | superseded
| **owner** | `aitutor-architect` |        the role that produced it
| **inputs** | [PRD — AITutor](…), [Intent 0003 · Set up a course](…) |
| **updated** | 2026-09-12 |
```

### Every chain step has a Jira task

`NNNN · Spec`, `NNNN · Implement`, `NNNN · Deploy`, `NNNN · Validate`, under the
requirement's epic. A role moves its task to `In Progress` when it starts, comments on it
with the page link when it finishes, and **never moves it to `Done`**. `Done` is the
human's act and mirrors `approved` on the page.

### The handover rules

1. **A role may only start when every input page it needs is `approved`.**
   If any input is `draft`, `ready-for-review` or `blocked`, stop and say which page and
   what state it is in. Do not proceed on an unapproved input. The page header is the
   gate; a Jira status is not a substitute for reading it.

2. **A role may never set its own output to `approved`.**
   When you finish, set the page to `ready-for-review`, comment the link on your task,
   and stop. Approval is a human act: they set the page to `approved` and the task to
   `Done`. This is the gate. Marking your own work approved removes it.

3. **Hand over only when the task is ready.**
   Before setting `ready-for-review`, verify your own skill's "Done when" list and state
   the result item by item, on the task as well as in your report. If any item fails,
   set the page to `blocked`, write why under a `## Blocked on` heading, label the task
   `blocked` with the same text as a comment, and stop.

4. **Unanswered questions block the chain.**
   If you cannot complete the artifact without a decision that is not yours to make, set
   the page to `blocked` and list the questions. Never guess and continue.

5. **Stay in your lane.**
   Write only the pages your role owns. If you find a fault in an upstream page, report
   it — as a comment on that page and on your task — do not edit it. Corrections go back
   to the role that owns that page.

6. **Traceability is mandatory.**
   Every page names its `inputs` as links and shares the `id` of the requirement it
   serves; every Jira issue carries `req-NNNN`. An artifact whose ID appears nowhere
   upstream is scope drift, and gets reported.

7. **Superseding, never overwriting.**
   When a decision changes, set the old page to `superseded`, add a `superseded-by` row
   linking the new page, and write a new one. Confluence keeps every version; that history
   is evidence, not clutter.

8. **Keep the indexes and the map honest.**
   When you create a page, add its row to the index page above it and its label. When you
   create a Jira issue, add it to the requirement map in `.claude/ATLASSIAN.md` in the same
   pull request as any repository change, or report the new keys so a human can.

### What to say at the end of every run

Finish every run with exactly these five lines:

```
ARTIFACT:  <page title and URL, or the pull request URL>
JIRA:      <issue key — status you left it in>
STATUS:    ready-for-review | blocked
DONE-WHEN: <each item, met or not met>
NEXT:      <the role that should run next, and what it needs from the human first>
```

### Document map

| Page (space `AI`) | Owner | Status |
|---|---|---|
| `problem.txt` (in the repository) | — | The original brief. This is what the role skills call the pitch. |
| `PRD — AITutor` | `aitutor-pm` | Nine-section PRD, nine ranked requirements `0001`–`0009`; the repository scaffold is a §7 constraint, not a requirement. Carries no technology by design — anything technical a requirement forces is a note for the architect in §7. |
| `Intent NNNN · …` | `aitutor-pm` | One per requirement, six fields, countable SUCCESS. |
| `ADR NNNN · …` | `aitutor-architect` | Twelve so far. One decision per ADR, two rejected options minimum. ADR numbers are their own sequence. |
| `Spec NNNN · …` | `aitutor-architect` | One per intent, written only when that intent is named to start. Spec 0001 exists. |
| `Architecture Overview` | `aitutor-architect` | The diagrams, rendered from `docs/diagrams/*.mmd` in this repository. |
| `Validation NNNN · …` | `aitutor-validator` | Created on first use. |
| `Deployment` | `aitutor-platform` | Written on first deploy; a placeholder until then. |

The files these pages replaced — `docs/prd.md`, `docs/intents/`, `docs/adr/`, `docs/specs/` —
were removed from the working tree on 2026-09-12 and are recoverable from commit `96f96e2`.
Earlier history: `docs/intent/` (singular — the nine pre-PRD intent files), the nine specs
that predated the PRD, and the UI mockups at `design/aitutor-ui/`, all in commit `fe3c550`.

## What this is

AITutor is a per-course study space for learners. A learner creates a course, declares its **objectives**, and adds a **session** for each class as it happens, attaching material (slides, PDFs, photos of the board) or writing a summary in their own words. They can then question their own material and get answers cited back to the session they came from, generate practice questions, and see how ready they are against the course objectives.

User: a learner taking a structured course — one that declares what it teaches and happens as sessions over time — wherever it runs (a training provider, a university, a structured online program). The **beachhead** is semester-shaped courses; see `docs/prd.md` §2 and open question 1. Positioning: a *co-learner* that runs the whole course loop — prepare, capture, understand, organize, practice — not a document search tool.

## The PRD

The `PRD — AITutor` page in the Confluence space `AI` is the source of truth for **what**
AITutor is and what it must do: the problem, the users, the six journeys, nine ranked
requirements `0001`–`0009` with countable acceptance criteria, out of scope with the reason
for each, the constraints table, the risks with their early signals, the open questions,
and the build phases.

This file is the source of truth for **how** it is built — stack, platform constraints,
model selection, architecture. Where a spec disagrees with the PRD on product intent, the
PRD wins; where the PRD strays into implementation, this file wins.

**Read the relevant requirement in the PRD before implementing anything.** Every spec must
trace to a requirement there, and every Jira issue carries its `req-NNNN` label.

Per-requirement detail lives on the `Intent NNNN · …` pages, not in the PRD. The capability
IDs `C1`–`C9` used by the superseded `docs/PRD.md` (commit `116b918`) map one to one onto
`0001`–`0009`; PRD §10 has the table. A scaffold requirement was briefly numbered `0001` on
2026-09-08 and then made a §7 constraint — see PRD open question 6.

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
