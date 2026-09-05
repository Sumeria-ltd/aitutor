# Spec: Check my summary

Satisfies [`docs/intent/check-my-summary.md`](../intent/check-my-summary.md).

> Builds on [`capture-a-session.md`](./capture-a-session.md) (the `Summary` document) and [`ask-my-course.md`](./ask-my-course.md) (the action runner and citation invariant). Amends neither.

---

## APPROACH

**Shape chosen.** One more `ActionDefinition` on the runner from `ask-my-course`. The scope is a single session; the input is the student's own submitted text; the output is three lists of located, cited observations — **what they had, what the session puts differently, and what is not in what they wrote** — and nothing that resembles a mark.

Four decisions carry this spec.

**1. The check endpoint requires a stored summary. There is no path that produces summary text.** `POST …/summary:check` operates on a `Summary` revision that already exists in Firestore, written by `PUT …/summary` from `capture-a-session`. No route, prompt, or schema in the product emits a draft, a model answer, or a "here's what the session covered" before the student has committed theirs. This is the intent's hardest limit and it is enforced by there being nothing to call.

**2. The response schema has no numeric field.** Not a score, not a percentage, not a count of missed points, not a five-star anything. The schema is three arrays of prose observations. A grade cannot leak into the UI because there is no field for one to travel in, and a later well-meaning addition would have to amend this spec to introduce it.

**3. Feedback is located, not general.** Every observation carries a citation — `sessionId`, `materialId`, `page` — validated by the same `validateCitations` that governs asking. "You didn't mention the Clausius inequality" is not actionable; "the Clausius inequality, slides 11–14, the whole second half" is. The intent requires a student be able to act within ten minutes, and a page number is what makes that true.

**4. Observations about the student's own text quote it.** `held` and `differs` items carry an `anchor` — a verbatim span from the submitted summary — so the UI can render feedback beside the sentence it is about. The anchor is validated as an exact substring of the submitted text; a model-paraphrased anchor is a validation failure, because feedback attached to words the student did not write is feedback about someone else's summary.

**Checking again is a new revision, never an edit.** Revising and resubmitting creates `Summary` revision *n+1* with its own feedback. The intent's third success signal — students revising after feedback — is then a count of sessions with more than one revision, needing no separate event to be trusted.

### Rejected alternatives

**Showing the session's key points beside the writing box, greyed out until they submit.** Rejected. Anything visible is assemblable, and the value of the exercise is entirely in retrieval from memory. The write screen shows the session title and date and nothing else — no slides, no outline, no previous revision.

**Scoring the summary, even privately, even only for readiness.** Rejected. A stored score is a score that will eventually be shown, sorted, or trended, and the intent puts grades in NOT NOW without qualification. `see-my-readiness` consumes the *existence* of a checked summary and the objectives it touched, never a quality figure.

**Returning a model summary alongside the feedback, "for comparison".** Rejected — it is the single most direct violation available. It converts the exercise into reading, and once seen it cannot be unseen for the next session.

**Rewriting or improving the student's text.** Rejected — NOT NOW in the intent, and it would take the artefact of their thinking and replace it with ours.

**Checking one summary against several sessions at once.** Rejected — NOT NOW, and it would make "what you left out" unanswerable: material from an adjacent session is not something the student was wrong to omit.

**Free-form conversational feedback instead of three structured lists.** Rejected. Prose is where hedging, encouragement-padding and implicit grading live. Three typed lists with mandatory citations make omissions visible and make the tone constraint checkable.

**Marking a summary against general knowledge of the subject.** Rejected — the intent is explicit: "a student is not wrong for omitting something their professor never taught." Scope is the session's own material, and the citation invariant enforces that every criticism points at a page the student actually has.

---

## INTERFACE

### Routes

```
POST /v1/courses/{courseId}/sessions/{sessionId}/summary:check
  Body:     { summaryId?: string }        // omitted = newest revision
  200:      SummaryFeedback
  404:      { error: "no_summary" }       — nothing written yet; nothing to check
  409:      { error: "no_material" }      — the session has no ready material to check against
  400:      { error: "scope_too_large", pages, limit }
  429:      { error: "rate_limited", retryAfterSeconds }
  502:      { error: "citation_invalid" | "anchor_invalid" }

GET /v1/courses/{courseId}/sessions/{sessionId}/summaries
  200:      { summaries: Summary[] }      // all revisions, newest first, feedback included
```

`409 no_material` is a real and expected outcome: a session captured as words alone has nothing to check the words against. The client says so plainly and offers to add material — it does not fall back to checking against general knowledge.

### Types

Extends the `Summary` established in [`capture-a-session.md`](./capture-a-session.md):

```ts
// packages/shared/src/summary.ts
export interface FeedbackItem {
  text: string                 // the observation, addressed to the student
  anchor: string | null        // verbatim span of THEIR summary; null for `missing`
  citation: Citation           // where in the session it lives
}

export interface SummaryFeedback {
  summaryId: string
  revision: number
  held: FeedbackItem[]         // matched the session
  differs: FeedbackItem[]      // the session puts it differently
  missing: FeedbackItem[]      // present in the session, absent from the summary
  checkedAt: string
  // No score. No count. No grade. Deliberately.
}

export interface Summary {
  id: string
  sessionId: string
  text: string
  wordCount: number
  revision: number
  feedback: SummaryFeedback | null   // null until checked
  createdAt: string
}
```

`held` exists so the response is not a list of failures. The intent is explicit that an incorrect summary must feel like useful information rather than a verdict, and a response that only ever enumerates shortcomings reads as one however it is worded.

### Action definition

```ts
// apps/api/src/ai/actions/checkSummary.ts
export const checkSummary: ActionDefinition<CheckInput, SummaryFeedback> = {
  kind: "check_summary",
  model: models.checkSummary,          // gemini-3.5-flash
  requiresCitations: true,
  responseSchema: /* held / differs / missing, each { text, anchor, citation } */,
  buildPrompt, parse, citationsOf,
}
```

Scope is fixed to the one session: `resolveScope(courseId, [sessionId])`. The runner's ordinary guards, validator, cost accounting and event emission all apply unchanged.

**Additional validation, specific to this action.** After `validateCitations`, the route asserts every non-null `anchor` is an exact substring of the submitted `text`. A failure retries once with a corrective instruction, then returns `502 anchor_invalid`. Feedback anchored to words the student did not write is not shown.

### Prompt contract

The system instruction states: the student wrote this from memory after the class; compare it **only** against the supplied session material; report what they got right, what the session states differently, and what the session covers that they did not mention; cite a page for every item; quote their own words verbatim in `anchor` when the item is about something they wrote; do not assign a score, grade, percentage or quality judgement of any kind; do not write or suggest a replacement summary; address the student directly and describe the material rather than evaluating the person.

`differs` items are instructed to state **what the session says**, not that the student is wrong — the distinction the intent draws between information and judgment, made a prompt-level rule and checkable in review.

### Client

```ts
// apps/web/src/summary/api.ts
checkSummary(courseId, sessionId, summaryId?): Promise<SummaryFeedback>
listSummaries(courseId, sessionId): Promise<Summary[]>
```

The write screen (`SummaryWrite.tsx`) fetches **nothing** about the session beyond its title and date. It issues no material read URLs and renders no page grid. This is a client-side property, asserted in acceptance criterion 6.

### Events

```ts
export type AuthedEventType =
  | ...                    // established in earlier specs
  | "summary_checked"      // meta: { sessionId, summaryId, revision, wordCount,
                           //         heldCount, differsCount, missingCount, ms, costMicros }
  | "summary_revised"      // meta: { sessionId, fromRevision, toRevision,
                           //         hoursSinceFeedback }
```

Item counts, never item content. `summary_revised` is what makes the intent's "students revise and resubmit after feedback, rather than reading it and closing the tab" a number.

---

## DATA LAYER

Feedback is stored **on the summary revision it belongs to** — no new collection.

```
students/{uid}/courses/{courseId}/sessions/{sessionId}/summaries/{summaryId}
  text            string                  // unchanged, from capture-a-session
  wordCount       number
  revision        number
  feedback        map | null              // SummaryFeedback, added here
    held          array<FeedbackItem>
    differs       array<FeedbackItem>
    missing       array<FeedbackItem>
    checkedAt     Timestamp
    model         string
    costMicros    number
  createdAt       Timestamp
```

Storing feedback beside the text it critiques means a revision is a complete, self-contained record: what the student wrote at that moment and what came back. Nothing has to be joined to reconstruct a check, and deleting a revision deletes its feedback with it.

`students/{uid}/usage/{yyyymm}` is incremented by the runner, as for every action.

### Deliberately not stored

- **Any score, grade, percentage, or quality rating.** Not on the summary, not on the session, not in an event, not in a private field "for analytics". There is no such number anywhere in the product.
- **A model-generated reference summary.** It is never produced, so there is nothing to store.
- **Cross-student comparison of any kind.** No cohort statistics per session, no percentile, no "students usually mention…". The product is single-user and the intent forbids comparison explicitly.
- **A `readFeedbackAt` timestamp.** `summary_revised` already answers whether feedback led anywhere; a read receipt would be a write per scroll and would invite an engagement metric the intent warns against.
- **Summary or feedback text in `events`.** Counts and timings only.

---

## STACK

**Unchanged from [`ask-my-course.md`](./ask-my-course.md). No new dependencies.**

**Model: `gemini-3.5-flash`** — the same entry as ask and explain, added to `apps/api/src/ai/models.ts` under `checkSummary` so the two can diverge later without a code change. This is the product's most quality-sensitive action: it reads a whole session's material against a few hundred words and must be specific enough to act on. It is the first candidate for the Pro-class escape hatch if an eval shows Flash-class insufficient — and per `CLAUDE.md`, only after such an eval.

**Generation config:** `temperature: 0.1`, `maxOutputTokens: 3072`. Lower than ask, because the task is comparison against a fixed document rather than composition.

**Scope size:** one session — typically 15–30 pages, far inside the 600-page ceiling. `scope_too_large` is reachable only for an unusually large deck and is retained rather than special-cased.

**Rate limiting:** 20 checks per student per hour, shared with the action limiter from `ask-my-course`. Re-checking after a revision is normal and must not be throttled in practice; the limit exists against loops.

---

## SCOPE

### Create

```
packages/shared/src/summary.ts             SummaryFeedback, FeedbackItem
apps/api/src/ai/actions/checkSummary.ts    the ActionDefinition
apps/api/src/ai/validateAnchors.ts         exact-substring assertion
apps/api/src/routes/summaryCheck.ts        POST …/summary:check, GET …/summaries

apps/web/src/summary/api.ts
apps/web/src/summary/hooks.ts
apps/web/src/routes/SummaryWrite.tsx       the deliberately empty screen
apps/web/src/routes/SummaryFeedback.tsx    their text, feedback anchored beside it
apps/web/src/components/FeedbackItem.tsx
```

### Change

```
packages/shared/src/session.ts             Summary gains `feedback`
packages/shared/src/events.ts              summary_checked, summary_revised
apps/api/src/ai/models.ts                  checkSummary entry
apps/api/src/services/summaries.ts         write feedback onto the revision
apps/api/src/index.ts                      mount the router
apps/web/src/router.tsx                    summary routes
apps/web/src/routes/SessionDetail.tsx      show the current revision and its feedback
```

### Must not be touched

- **`docs/intent/**`**, **`CLAUDE.md`**, **`problem.txt`** — as established.
- **`firestore.rules`** — deny-all stands.
- **`apps/api/src/ai/runner.ts`** and **`apps/api/src/ai/validateCitations.ts`** — this action uses the pipeline as specified by `ask-my-course`. Anchor validation is an *additional* check in this action's route, not a modification of the shared validator.
- **`PUT …/summary`** in `apps/api/src/routes/summaries.ts` — the write path belongs to `capture-a-session` and stores the student's bytes verbatim. Checking does not alter what was stored.

---

## ACCEPTANCE

### One per SUCCESS signal in the intent

**1. "A student who checks one summary goes on to check more."**
Every check emits `summary_checked` with `sessionId` and a server timestamp. Per-student check counts and the distribution of checks-per-student are a group-by over one event type. First-check-to-second-check conversion needs no join.

**2. "Feedback names specific missing content rather than offering generic encouragement."**
Every `missing` item carries a validated `citation` with a page number within the cited material's `pageCount`. An item with a null or unresolvable citation is a validation failure and is not returned. A reviewer sampling any ten checks can open every cited page.

**3. "Students revise and resubmit after feedback."**
A resubmission creates revision *n+1* and emits `summary_revised` carrying `fromRevision`, `toRevision` and `hoursSinceFeedback`. The revision rate is also assertable directly against the database as the share of sessions whose `summaries` subcollection holds more than one document.

**4. "Over a term, summaries get written closer to the lecture."**
`summary_written` (from `capture-a-session`) carries `hoursAfterSessionHeld`. Trending its median by ISO week over a term requires no field this spec adds.

### Derived from LIMITS

**5. The student writes first — enforced, not asked.** `POST …/summary:check` against a session with no `Summary` document returns `404 no_summary` and makes no model call. There is no request body variant, query parameter, or debug flag that returns session content without a stored summary.

**6. Nothing is revealed before commitment.** Loading `SummaryWrite.tsx` for a session issues no request for material read URLs, no page-grid render, and no fetch of a previous revision's text. Verified by asserting the network log for that route contains only the session metadata request.

**7. No model answer exists to leak.** No route, action definition, prompt, or response schema in the product produces summary text on the student's behalf. A grep of `apps/api/src/ai/actions/` finds no schema field that carries a written summary.

**8. There is no score.** The `SummaryFeedback` type, the Vertex `responseSchema`, the stored Firestore map, and every event payload contain no numeric quality field. Adding one requires amending this spec.

**9. Feedback is measured against the session, not the subject.** Given a summary that omits a topic standard to the subject but absent from the session's material, that topic does not appear in `missing`. Given a summary that includes such a topic, it does not appear in `differs` as an error.

**10. Feedback is located.** Every item in all three lists carries a citation whose `sessionId` is the session being checked — enforced by `validateCitations` against a scope set of exactly one session. An item citing any other session fails the request rather than being filtered out.

**11. Anchors are the student's own words.** Every non-null `anchor` is an exact substring of the submitted `text`. A paraphrased anchor triggers one retry and then `502 anchor_invalid`; no feedback is displayed against words the student did not write.

**12. Tone is structurally constrained.** Every response carries a `held` array, populated whenever the summary matched anything. No field in the schema can express a verdict on the student — items describe the material, and the two lists that name shortfalls are titled by what the *session* contains, not by what the student failed to do.

**13. A session with no material says so.** Checking a words-only session returns `409 no_material`, makes no model call, and produces a client message offering to add material. It does not check the summary against general knowledge.

**14. Checking is single-session.** The scope set sent for any check contains exactly one `sessionId`. There is no parameter that widens it.

**15. Cost is attributed.** After a check, `students/{uid}/usage/{yyyymm}.actionCounts.check_summary` has increased by one and `costMicros` by the amount recorded on the feedback map.
