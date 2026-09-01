# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Pre-implementation. The repository currently contains `problem.txt` (the original product brief) and this file. No code has been scaffolded, so there are no build, test, or lint commands yet — add them here when the project is scaffolded.

## What this is

AITutor is a per-course study space for university students. A student creates a course, declares its **objectives**, and adds a **session** for each class as it happens, attaching material (slides, PDFs, photos of the board) or writing a summary in their own words. They can then question their own material and get answers cited back to the session they came from, generate practice questions, and see how ready they are against the course objectives.

Wedge user: university students (MENA). Positioning: a *co-learner* that runs the whole semester loop — prepare, capture, understand, organize, practice — not a document search tool.

## Intent files

`docs/intent/` holds one file per feature, each stating a business requirement — who is stuck, and what changes when this works. Every file uses the same six headings, in order: **PROBLEM · USER · OUTCOME · SUCCESS · LIMITS · NOT NOW**.

These must survive a total rewrite, so they contain no implementation detail: no stack, no schemas, no model names, no API behaviour. SUCCESS is written as measurable outcomes rather than shipped features. LIMITS is where the product invariants below get applied to a specific feature.

New features get an intent file before they get a design. Read the relevant one before implementing anything.

## Product invariants

These are deliberate design decisions, not gaps. Do not "improve" the product by violating them.

- **The student's effort is the mechanism, not friction.** Finding a resource, assigning it to a session, and putting it in their own words is generative work, and generative work is what produces retention. Never add a feature that removes the student's summarizing or self-testing work. Automating *transcription* (e.g. extracting objectives from an uploaded syllabus) is fine; automating *comprehension* is not.
- **Effort must pay back immediately and visibly.** The corollary of the above. Every act of capture should return something the student can see — a check on their summary, a coverage bar moving, a quiz result.
- **Single-user and private.** No shared course spaces, no crowd-sourced material, no social layer. A course belongs to one student.
- **Answers are grounded in the student's own material.** Never answer from general model knowledge when the student is asking about their course. If the scoped material doesn't support an answer, say so.

## Architecture

**Structure replaces retrieval.** There is deliberately no vector database, embedding pipeline, or semantic search. The student has already told us which session each material belongs to, so retrieval is a scope query (`WHERE session_id IN (...)`) and the selected documents go into context directly. This is both simpler and a truer expression of the product thesis: the student's organizing effort is literally what makes retrieval work.

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

Unit economics are the reason this product can work at MENA price points: Flash-class puts an active student in roughly the $1–2/month range of model spend. Changes that multiply token usage per interaction are business decisions, not just technical ones.
