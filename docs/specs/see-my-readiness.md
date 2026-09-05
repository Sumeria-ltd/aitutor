# Spec: See my readiness

Satisfies [`docs/intent/see-my-readiness.md`](../intent/see-my-readiness.md).

> Builds on [`set-up-a-course.md`](./set-up-a-course.md) (objectives), [`capture-a-session.md`](./capture-a-session.md), [`ask-my-course.md`](./ask-my-course.md) (the runner), [`check-my-summary.md`](./check-my-summary.md) and [`quiz-me.md`](./quiz-me.md). Amends none of them.
>
> **Adds the fifth and final action: `coverage`.** After this spec the product makes no model call that is not one of ask, explain, check_summary, quiz, coverage, or syllabus extraction.

---

## APPROACH

**Shape chosen.** Readiness is a **read of denormalised evidence already attached to each objective**, not a computation performed when the student opens the page. Evidence accumulates as a side effect of the work the student was already doing — material becoming ready, a summary being checked, a practice completing — and the readiness view is a single query over a course's objectives.

Four decisions carry this spec.

**1. Viewing readiness makes no model call and costs nothing.** The intent's first success signal is students opening it *during* term rather than only before an exam, which requires it to be instant and free. A page that costs a Flash call and four seconds every time it is opened is a page nobody opens on a Tuesday.

**2. Evidence lives on the objective document and is maintained incrementally.** Each objective carries the sessions linked to it, which of those have ready material, which have a checked summary, and how practice on it went. Every task that changes any of those updates the affected objectives in the same unit of work. A repair task recomputes an entire course from scratch and is idempotent, so drift is fixable rather than permanent.

**3. Sessions link to objectives from two sources, and the student's wins.** A student may assign objectives to a session when capturing it (`objectiveIds`, from `capture-a-session`). The `coverage` action additionally reads a session's material against the course's declared objectives and proposes links (`suggestedObjectiveIds`). Suggestions are additive, visible as suggestions, and removable; a student's assignment is never overwritten, never removed, and never contradicted.

This is transcription, not comprehension: the objectives already exist, declared by the student, and the model is matching material to a fixed list — the same class of work as reading objectives off a syllabus. It is not deciding what the student understands.

**4. Untouched objectives are ordered first by the API, not by the client.** `GET …/readiness` returns objectives sorted `untouched → thin → evidenced`, and within a band by the student's own ordering. The intent says untouched objectives "must not be crowded out by the areas the student has already invested in", and leaving that to a client sort is leaving it to be lost in a refactor.

**Readiness reports evidence and refuses to predict.** The payload carries counts and links — sessions with material, whether words were written, how many practice questions on this objective landed in "revisit". It carries no score, no readiness percentage, no predicted grade, and no traffic light. The intent's failure mode is precise: "it replaced a vague accurate anxiety with a precise false comfort", and every summarising number is a step toward that.

**With no objectives, readiness is unavailable and says why.** `GET …/readiness` returns `{ available: false, reason: "no_objectives" }` and the client renders a statement and a link to add them — not an empty chart, not zeroes, not a confident-looking nothing.

### Rejected alternatives

**Computing readiness on read, by querying sessions, summaries and practices.** Rejected. It is a few hundred document reads per view for a busy course, on the one screen that must be cheap enough to open casually. Incremental maintenance moves that cost to the writes, which are rarer.

**A readiness score, percentage, or letter.** Rejected. It is the single most requested thing this screen could show and the intent forbids it twice. A number invites comparison against a threshold nobody has calibrated, and its accuracy is unfalsifiable until an exam disagrees — at which point the product has done active harm.

**A model call that judges "is this student ready for this objective".** Rejected outright. It is a prediction dressed as an observation, it would read the student's summaries to make it, and it automates the comprehension judgement the product invariants reserve for the student.

**Linking sessions to objectives only from student assignment.** Rejected, though it is the purist option. Students will not assign objectives reliably, and readiness built on unreliable linkage shows gaps that are artefacts of admin rather than of study — which trains students to distrust the one screen that must be trusted.

**Linking only from model coverage, discarding student assignment.** Rejected. The student's own linkage is the highest-quality signal available and discarding it would be the product overruling them about their own course.

**Weighting evidence — material counts 1, summary 2, practice 3.** Rejected. Weights are a score with extra steps, and there is no principled basis for the numbers.

**Recommending what to study next, in priority order.** Rejected as a *ranking*; the ordering by evidence band is not a recommendation but a fact about what has nothing behind it. "Planning the student's week or scheduling their study time" is NOT NOW in the intent.

**Sharing readiness, exporting it, or comparing it to a cohort.** Rejected — NOT NOW, and against the single-user invariant.

---

## INTERFACE

### Routes

```
GET /v1/courses/{courseId}/readiness
  200:      ReadinessReport | ReadinessUnavailable
  Reads objective documents only. No model call. No fan-out over sessions.

POST /v1/courses/{courseId}/readiness:rebuild
  202:      { status: "accepted" }
  Enqueues a full recomputation of every objective's evidence for this course.
  Idempotent. Exposed to the student as "recalculate" and used by support.

DELETE /v1/courses/{courseId}/sessions/{sessionId}/suggested-objectives/{objectiveId}
  204:      —
  Removes a model-suggested link. Student assignments are removed via
  PATCH …/sessions/{sessionId} (capture-a-session), which this route does not touch.

POST /v1/internal/sessions/{sessionId}:cover
  Auth:     Cloud Tasks OIDC. Not publicly reachable.
  202:      {}
  Runs the coverage action for one session, then updates affected objectives.
```

### Types

```ts
// packages/shared/src/readiness.ts
export type EvidenceBand = "untouched" | "thin" | "evidenced"

export interface ObjectiveReadiness {
  objectiveId: string
  text: string
  position: number
  band: EvidenceBand

  materialSessions: { sessionId: string; ordinal: number; title: string }[]
  summarySessions: { sessionId: string; ordinal: number; title: string }[]
  practiceQuestions: number         // answered, across completed practices
  practiceRevisit: number           // of those, ones that landed in "revisit"
  lastEvidenceAt: string | null
}

export interface ReadinessReport {
  available: true
  courseId: string
  objectives: ObjectiveReadiness[]  // SORTED: untouched, thin, evidenced
  untouchedCount: number
  computedAt: string
  staleSessions: number             // sessions whose coverage has not yet run
  // No score. No percentage. No prediction. Deliberately.
}

export interface ReadinessUnavailable {
  available: false
  reason: "no_objectives"
  courseId: string
}
```

**Band assignment**, mechanical and stated in full:

| Band | Condition |
|---|---|
| `untouched` | no linked session with ready material, **and** no practice questions |
| `thin` | material exists, but no checked summary **or** no practice on it |
| `evidenced` | at least one linked session with material **and** a checked summary, **and** at least one answered practice question |

`practiceRevisit` is reported but does **not** demote a band. Getting practice questions wrong is evidence of engagement, not of absence, and demoting for it would make the honest student's page look worse than the one who never practised.

`staleSessions` is the count of sessions whose material is ready but whose coverage run has not completed. It is shown, because a readiness page that silently omits half a course is the precise failure the intent's fourth signal warns about.

### Action definition

```ts
// apps/api/src/ai/actions/coverage.ts
export const coverage: ActionDefinition<CoverageInput, CoverageLink[]> = {
  kind: "coverage",
  model: models.coverage,              // gemini-3.5-flash-lite
  requiresCitations: true,
  responseSchema: /* links[]: { objectiveId, citation } */,
  buildPrompt, parse, citationsOf,
}
```

Scope is one session. The prompt supplies the course's objectives with their ids and instructs: return only objectives this session's material genuinely addresses; cite the page that addresses it; return an empty array rather than stretching to find a match; do not judge how well the material covers it, only whether it does.

`objectiveId` is typed in the schema as an enum of the course's actual objective ids, and the route drops any link whose id is not among them. Citations go through `validateCitations` against the single-session scope like every other action.

### Evidence maintenance

Evidence is updated by a Cloud Tasks handler, `updateObjectiveEvidence(courseId, objectiveIds[])`, enqueued by:

| Trigger | Established in |
|---|---|
| material reaches `ready` | `capture-a-session` — also enqueues `:cover` for the session |
| a summary is checked | `check-my-summary` |
| a practice completes | `quiz-me` |
| session `objectiveIds` change | `capture-a-session` |
| an objective is created or deleted | `set-up-a-course` |
| coverage produces suggestions | this spec |

The handler recomputes the affected objectives' evidence from source data with bounded queries inside one course, and is idempotent. `readiness:rebuild` is the same handler over every objective of a course.

### Client

```ts
// apps/web/src/readiness/api.ts
getReadiness(courseId): Promise<ReadinessReport | ReadinessUnavailable>
rebuildReadiness(courseId): Promise<void>
removeSuggestedObjective(courseId, sessionId, objectiveId): Promise<void>
```

### Events

```ts
export type AuthedEventType =
  | ...                    // established in earlier specs
  | "readiness_viewed"       // meta: { courseId, untouchedCount, objectiveCount, staleSessions }
  | "readiness_acted"        // meta: { courseId, objectiveId, action: "capture" | "practise" | "ask" }
  | "coverage_computed"      // meta: { sessionId, linkCount, ms, costMicros }
  | "suggestion_removed"     // meta: { sessionId, objectiveId }
```

`readiness_acted` is emitted when a student follows one of the actions offered on an untouched objective. The intent's second signal — "what it flags as thin is what they capture or practise next" — is otherwise only inferable by correlating a view with later unrelated activity.

`suggestion_removed` is the correctness signal for the coverage action: a high removal rate means the model is over-linking, which would inflate coverage and hide real gaps.

---

## DATA LAYER

Extends the objective document from `set-up-a-course` and the session document from `capture-a-session`. **No new collections.**

```
students/{uid}/courses/{courseId}/objectives/{objectiveId}
  text, position, origin, createdAt, updatedAt      // unchanged
  evidence                map                       // added here
    sessionIds            array<string>             // linked, from both sources
    materialSessionIds    array<string>             // of those, with ready material
    summarySessionIds     array<string>             // of those, with a checked summary
    practiceQuestions     number
    practiceRevisit       number
    band                  string                    // denormalised for sorting
    lastEvidenceAt        Timestamp | null
    computedAt            Timestamp

students/{uid}/courses/{courseId}/sessions/{sessionId}
  objectiveIds            array<string>             // STUDENT-ASSIGNED. Never model-written.
  suggestedObjectiveIds   array<string>             // added here; model-proposed, removable
  coverageStatus          string                    // "pending" | "done" | "failed"
  coverageAt              Timestamp | null
```

**`objectiveIds` is never written by any model-driven code path.** Suggestions land in `suggestedObjectiveIds`, a separate field, and the two are unioned only at evidence-computation time. This keeps the student's own linkage recoverable and auditable, and makes "the model overwrote my assignment" structurally impossible.

`band` is denormalised onto the evidence map so the readiness query is a single ordered read of the objectives collection rather than a fetch-then-sort of every objective's evidence.

### Deliberately not stored

- **No readiness score, percentage, grade, or predicted outcome.** No field exists for one anywhere in this spec.
- **No history of readiness over time.** A trend line would become a progress score, and nothing in the intent needs one. `lastEvidenceAt` answers "when did anything last happen here".
- **No model judgement of quality.** Coverage returns whether material addresses an objective. It does not return how well, how deeply, or how ready the student is.
- **No cohort or comparison data.** Single-user; the intent forbids comparison and forbids the report having any reader but the student.
- **No exportable or shareable readiness artefact.** NOT NOW in the intent, and "nothing in its design should assume a future reader other than them."

---

## STACK

**Unchanged from [`ask-my-course.md`](./ask-my-course.md). No new dependencies.**

**Model: `gemini-3.5-flash-lite`**, registered as `coverage`. Matching material against a supplied list of objectives is the same class of work as syllabus extraction — recognition against a fixed list, no composition, structured output — and it runs once per session automatically, which makes it the highest-volume action in the product. Flash-Lite is the tier that keeps it inside the unit economics.

**Generation config:** `temperature: 0.0`, `maxOutputTokens: 1024`. Deterministic: the same material against the same objectives should not link differently on a retry.

**Cloud Tasks queues:** `coverage` (max 5 concurrent) and `evidence` (max 20 concurrent). Coverage is throttled because it is the model call; evidence maintenance is pure Firestore.

**Coverage runs once per session**, triggered when the session's first material reaches `ready`, and again when material is added to a session already covered. It does not re-run when readiness is viewed.

> **Cost note.** One Flash-Lite call per session over that session's material — a handful per course per week at most. Confirm rates against Google's official Vertex AI pricing page.

---

## SCOPE

### Create

```
packages/shared/src/readiness.ts           ObjectiveReadiness, ReadinessReport, EvidenceBand
apps/api/src/ai/actions/coverage.ts
apps/api/src/routes/readiness.ts           GET readiness, POST readiness:rebuild
apps/api/src/routes/internal/cover.ts      Cloud Tasks target
apps/api/src/services/readiness.ts         band assignment, ordering
apps/api/src/tasks/updateObjectiveEvidence.ts
apps/api/src/tasks/coverSession.ts

apps/web/src/readiness/api.ts
apps/web/src/readiness/hooks.ts
apps/web/src/routes/Readiness.tsx          untouched first and largest
apps/web/src/components/EvidenceStrip.tsx  three unfilled/filled segments, no hue coding
apps/web/src/components/ReadinessUnavailable.tsx
```

### Change

```
packages/shared/src/course.ts              Objective gains `evidence`
packages/shared/src/session.ts             Session gains suggestedObjectiveIds, coverageStatus
packages/shared/src/events.ts              four new AuthedEventType values
apps/api/src/ai/models.ts                  coverage entry
apps/api/src/tasks/processMaterial.ts      enqueue :cover when a session's material is ready
apps/api/src/services/summaries.ts         enqueue evidence update after a check
apps/api/src/services/practices.ts         enqueue evidence update on complete
apps/api/src/services/objectives.ts        enqueue evidence update on create/delete
apps/api/src/index.ts                      mount routers
apps/web/src/router.tsx                    readiness route
apps/web/src/routes/CourseHome.tsx         the readiness snapshot panel
```

### Must not be touched

- **`docs/intent/**`**, **`CLAUDE.md`**, **`problem.txt`** — as established.
- **`firestore.rules`** — deny-all stands.
- **`apps/api/src/ai/runner.ts`**, **`validateCitations.ts`** — used as specified by `ask-my-course`.
- **`Session.objectiveIds`** — the student's own assignment. Coverage writes `suggestedObjectiveIds` and nothing else.
- **`apps/api/src/services/summaries.ts`'s feedback shape** — readiness consumes the *existence* of a checked summary, never its content or any derived quality.

---

## ACCEPTANCE

### One per SUCCESS signal in the intent

**1. "Students open readiness during the term, not only in the days before an exam."**
`GET …/readiness` performs no model call and reads at most `objectiveCount` documents (≤ 24), so it is cheap enough to open casually. Every view emits `readiness_viewed` with a server timestamp, making views-per-student-per-week a group-by over one event type — and views in week 4 distinguishable from views in exam week without inference.

**2. "Students act on it: what it flags as thin is what they capture or practise next."**
Following an action offered on an objective emits `readiness_acted` with that `objectiveId` and which action was taken. Act-on-view rate is the share of `readiness_viewed` events followed by a `readiness_acted` for the same course, and the acted-on objective's band is knowable at the time of the event.

**3. "Objectives that begin the term with no evidence behind them acquire some by the end."**
`evidence.lastEvidenceAt` is null for an objective with no evidence and set the first time any arrives. The share of objectives that moved out of `untouched` over a term is a query over objective documents, needing no history table.

**4. "It matches reality."**
Band assignment is fully mechanical and stated in the table above; no model output influences it. Given a course whose sessions, summaries and practices are known, the band of every objective is derivable by hand and must match what the API returns. `readiness:rebuild` recomputes from source and produces byte-identical evidence for an unchanged course — so drift between the denormalised view and the underlying facts is detectable rather than silent.

### Derived from LIMITS

**5. Readiness reports evidence, never a grade.** `ReadinessReport`, the stored evidence map, and every event payload contain no score, percentage, prediction, or traffic-light field. The rendered page shows counts, session links and filled/unfilled segments, and no summarising number for a course.

**6. A gap looks like a gap.** An objective with no linked material and no practice is returned in band `untouched`, sorted before every other objective regardless of the student's ordering, and rendered as the largest element on the page. This ordering is produced by the API; a client that ignored it would still receive untouched objectives first.

**7. Investment does not crowd out avoidance.** Given a course with five `evidenced` objectives and one `untouched`, the untouched objective is first in the returned array and `untouchedCount` is 1. No amount of work on other objectives changes either.

**8. With no objectives, it says so.** `GET …/readiness` for a course with zero objectives returns `{ available: false, reason: "no_objectives" }`. It does not return an empty report, a zeroed report, or a 404, and the client renders a statement plus a link to add objectives.

**9. Thin evidence is stated, not smoothed.** An objective with material but no summary and no practice is `thin`, and the payload names which of the three is present. A student cannot mistake "I have the slides" for "I have done the work".

**10. Incomplete coverage is disclosed.** `staleSessions` is non-zero while any ready session awaits its coverage run, and the client says that some sessions are not yet counted. Readiness never presents a partial picture as complete.

**11. The student's linkage is never overwritten.** Running coverage over a session with student-assigned `objectiveIds` leaves that array byte-identical and writes only `suggestedObjectiveIds`. Removing a suggestion removes it from `suggestedObjectiveIds` only, and re-running coverage does not resurrect a suggestion the student removed.

**12. Coverage cites.** Every link returned by the coverage action carries a citation whose `sessionId` is the session being covered and whose page is within the cited material. A link citing another session fails the run rather than being filtered.

**13. Viewing is free.** Opening readiness makes no model call and increments no counter in `students/{uid}/usage/{yyyymm}`. Only `coverage_computed` carries a `costMicros`, and it is emitted from the background task, not from a view.

**14. Readiness has no other reader.** No route returns another student's readiness, no export exists, and no field in the report is shaped for an instructor, institution, or parent.
