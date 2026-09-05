# Spec: Quiz me

Satisfies [`docs/intent/quiz-me.md`](../intent/quiz-me.md).

> Builds on [`ask-my-course.md`](./ask-my-course.md) (the action runner and citation invariant) and [`capture-a-session.md`](./capture-a-session.md). Amends neither.

---

## APPROACH

**Shape chosen.** A **practice** is one document holding a scope, a set of generated questions, and the student's answers as they arrive. Generation is one call on the runner from `ask-my-course`; every question must cite the page of the student's own material it came from, and the citation invariant is what makes "recognisably about *their* course" enforceable rather than aspirational.

Four decisions carry this spec.

**1. Every question carries a validated citation, and that is the anti-genericism mechanism.** The intent's fourth signal — "if students dismiss them as generic, the feature has failed" — has no obvious test. Requiring each question to name a session and page in the scope that was sent gives it one: a question that cannot point at the material it came from is rejected before the student sees it. This is the same `validateCitations` that governs asking, applied to a different output shape.

**2. Correct answers are never sent to the client before the question is answered.** The practice document holds `correctIndex` and `whyCorrect`; the serializer strips both from any question the student has not yet answered. Shipping the whole set and hiding it in the UI would make the feature trivially defeatable by anyone who opens the network tab — and self-testing that can be trivially defeated is self-deception with extra steps.

**3. A practice over one session is the same object as a practice over ten.** `sessionIds` is an array; the five-minute check before Tuesday's lecture and the exam-week run differ only in its length. The intent says the weekly case matters as much as the cram, and giving it a distinct shape would be how it ends up as the neglected one.

**4. Results lead with what to revisit, and carry no score.** `PracticeResult` has a `revisit` array first and a `held` array second. There is no percentage, no fraction, no pass mark, and no grade. A student can count the entries — that is unavoidable and fine — but nothing in the payload or the UI frames the run as a mark out of eight.

**Skipped is not wrong.** A skipped question lands in `revisit` with `skipped: true`, distinguished from an incorrect answer. The intent is explicit that getting things wrong must feel like information; treating "I didn't know" as a failure is the fastest way to make students answer defensively.

**Coverage gaps are not quiz answers.** A question the material does not support cannot be generated, because it could not carry a valid citation. An objective the course never covered surfaces in [`see-my-readiness.md`](./see-my-readiness.md) as a gap — never here as a question the student gets wrong.

### Rejected alternatives

**Free-text or short-answer questions, graded by a second model call.** Rejected for v1, and this is the uncomfortable one. Multiple choice is recognition, and this product's whole thesis is that recall beats recognition — so MCQ is the weaker instrument on the axis the product cares most about. It is chosen anyway because grading free text means a model call per question, a second surface where the "information, not judgment" tone can fail, and a second place a score could creep in. **The recall work is carried by [`check-my-summary.md`](./check-my-summary.md)**, which is genuinely generative and is where the intent locates the product's core value. Short-answer practice is the most defensible thing to add after v1, and it needs its own spec.

**Generating questions on demand, one at a time.** Rejected. A model call per question multiplies cost by the question count and makes a set slow to start. One call produces the set; the student answers at their own pace against a stored document.

**Sending the full question set including answers, and hiding them client-side.** Rejected — reasoning above.

**Storing a score, a percentage, or a streak on the practice or the course.** Rejected. The intent puts "how they scored" second to "what to do next", and a stored number is one that gets trended, compared and eventually shown. Readiness consumes *which objectives were practised and how it went per objective*, not a figure.

**Spaced repetition or a review schedule.** Rejected — NOT NOW in the intent, and it would make the product a scheduler, which is a different thing with different obligations.

**Timed runs or exam simulation.** Rejected — NOT NOW.

**Shared, exported or importable question sets.** Rejected — NOT NOW, and it would break the single-user invariant and the grounding invariant in one move: an imported set is by definition not from this student's material.

**Questions spanning several courses.** Rejected — NOT NOW, and the scope set would be ambiguous exactly as in `ask-my-course`.

**Reusing questions across practices to save generation cost.** Rejected. Material changes as a term goes on, and a cached question can outlive the page it cites. The citation invariant would still pass and the question would still be stale.

---

## INTERFACE

### Routes

```
POST /v1/courses/{courseId}/practices
  Body:     { sessionIds?: string[],          // omitted = whole course
              questionCount?: number }        // 4..12, default 8
  201:      Practice                          // questions REDACTED (see serialization)
  400:      { error: "scope_empty" }          — no ready material in scope
            { error: "scope_too_large", pages, limit }
  429:      { error: "rate_limited", retryAfterSeconds }
  502:      { error: "citation_invalid" }
  Generation is synchronous. The student pressed "quiz me" and is waiting.

GET /v1/courses/{courseId}/practices/{practiceId}
  200:      Practice                          // redacted per question, per answered state

POST /v1/courses/{courseId}/practices/{practiceId}/answers
  Body:     { questionId: string, choiceIndex: number | null }   // null = skip
  200:      { correct: boolean, correctIndex: number,
              whyCorrect: string, citation: Citation }
  409:      { error: "already_answered" }
  Answering is what unseals that question. Idempotent per question.

POST /v1/courses/{courseId}/practices/{practiceId}:complete
  200:      PracticeResult
  Completes with unanswered questions treated as skipped.

GET /v1/courses/{courseId}/practices?limit=20&cursor=
  200:      { practices: PracticeSummary[], nextCursor: string | null }
```

### Types

```ts
// packages/shared/src/practice.ts
export interface PracticeQuestion {
  id: string
  prompt: string
  options: string[]                 // exactly 4
  citation: Citation                // validated against the scope actually sent
  objectiveIds: string[]            // 0..n; consumed by see-my-readiness
  answeredIndex: number | null      // null = unanswered or skipped
  skipped: boolean
  answeredAt: string | null

  // Present only after this question is answered:
  correctIndex?: number
  whyCorrect?: string
}

export interface Practice {
  id: string
  courseId: string
  sessionIds: string[]
  status: "in_progress" | "complete"
  questions: PracticeQuestion[]
  createdAt: string
  completedAt: string | null
}

export interface RevisitItem {
  questionId: string
  prompt: string
  yourChoice: string | null         // null when skipped
  skipped: boolean
  whatTheSessionSays: string
  citation: Citation
  sessionTitle: string
}

export interface PracticeResult {
  practiceId: string
  revisit: RevisitItem[]            // FIRST, and the point of the screen
  held: { questionId: string; prompt: string; citation: Citation }[]
  objectiveIds: string[]            // union across questions; feeds readiness
  completedAt: string
  // No score. No percentage. No pass mark. Deliberately.
}
```

**Serialization rule.** `correctIndex` and `whyCorrect` are stored on the Firestore document and are omitted by the API serializer for every question whose `answeredAt` is null. This is one function, `redactPractice()`, applied on every route that returns a `Practice` — not a per-route decision.

### Action definition

```ts
// apps/api/src/ai/actions/generateQuiz.ts
export const generateQuiz: ActionDefinition<QuizInput, GeneratedQuestion[]> = {
  kind: "quiz",
  model: models.quiz,                  // gemini-3.5-flash
  requiresCitations: true,
  responseSchema: /* questions[]: { prompt, options[4], correctIndex,
                                    whyCorrect, citation, objectiveIds[] } */,
  buildPrompt, parse, citationsOf,
}
```

`citationsOf` returns one citation per question, so `validateCitations` rejects the whole set if **any** question cites outside scope. A partially valid set is not served: a set containing one fabricated question is a set the student cannot trust.

**Additional validation, specific to this action:**

- exactly four `options`, all distinct, none empty;
- `0 ≤ correctIndex ≤ 3`;
- every `objectiveIds` entry is an objective of this course — unknown ids are dropped rather than failing the set, since objective tagging is a convenience for readiness and not the question's substance;
- `questions.length` equals the requested count.

A structural failure retries once, then returns `502 citation_invalid`.

### Prompt contract

The system instruction states: write questions answerable **only** from the supplied documents; use the notation, symbols and terminology the documents use rather than a textbook's; cite the session id and page each question comes from; do not write questions about material that is not present; make distractors plausible and drawn from the same material rather than absurd; give `whyCorrect` as a short statement of what the session says, addressed to the student, without praise or reproach; tag each question with the course objectives it exercises, from the supplied list, or none.

The objective list is included in the prompt because `see-my-readiness` needs practice evidence attributed per objective, and attributing it at generation time is one call rather than a second pass.

### Client

```ts
// apps/web/src/practice/api.ts
startPractice(courseId, input: { sessionIds?: string[]; questionCount?: number }): Promise<Practice>
getPractice(courseId, practiceId): Promise<Practice>
answerQuestion(courseId, practiceId, questionId, choiceIndex: number | null): Promise<AnswerReveal>
completePractice(courseId, practiceId): Promise<PracticeResult>
listPractices(courseId, cursor?): Promise<{ practices: PracticeSummary[]; nextCursor: string | null }>
```

### Events

```ts
export type AuthedEventType =
  | ...                    // established in earlier specs
  | "practice_started"     // meta: { practiceId, courseId, scopeSize, questionCount,
                           //         ms, costMicros }
  | "practice_answered"    // meta: { practiceId, questionId, correct, skipped }
  | "practice_completed"   // meta: { practiceId, questionCount, revisitCount,
                           //         skippedCount, secondsElapsed }
  | "practice_abandoned"   // meta: { practiceId, answeredCount, questionCount }
  | "practice_followed"    // meta: { practiceId, questionId, sessionId } — a citation opened
```

`practice_abandoned` is emitted by a sweeper for practices left `in_progress` for 48 hours. The intent's second signal is completion rather than abandonment, and it is only measurable if abandonment is recorded rather than inferred from absence.

---

## DATA LAYER

```
students/{uid}/courses/{courseId}/practices/{practiceId}
  sessionIds      array<string>
  status          string              // "in_progress" | "complete"
  questionCount   number
  questions       array<map>
    id            string
    prompt        string
    options       array<string>       // 4
    correctIndex  number              // SERVER ONLY — redacted until answered
    whyCorrect    string              // SERVER ONLY — redacted until answered
    citation      map                 // { sessionId, materialId, page }
    objectiveIds  array<string>
    answeredIndex number | null
    skipped       boolean
    answeredAt    Timestamp | null
  model           string
  costMicros      number
  createdAt       Timestamp
  completedAt     Timestamp | null
```

Questions are embedded rather than a subcollection: a practice is bounded at twelve questions, is always read whole, and is answered by one student in one sitting. A subcollection would be N+1 reads to render a screen that always needs all of them.

Answering is a transactional update to one array element, guarded on `answeredAt == null`, which is what makes `409 already_answered` reliable rather than racy.

`students/{uid}/usage/{yyyymm}` is incremented by the runner at generation. Answering and completing make no model call and cost nothing.

### Deliberately not stored

- **No score, percentage, mark, or pass threshold.** Not on the practice, not on the course, not in an event. `revisitCount` in an event is an operational count, not a grade, and it is never rendered as one.
- **No streak, no consecutive-days counter, no badge.** NOT NOW in `capture-a-session`'s intent and against this one's tone requirement.
- **No question bank, no reuse pool, no cross-practice question index.** Every practice generates its own questions from current material.
- **No cross-student statistics** — no per-question difficulty, no "most students get this wrong". Single-user, and the intent forbids comparison.
- **No review schedule or next-due date.** Spaced repetition is NOT NOW; a stored due date would be its first half.
- **No question or answer text in `events`.** Ids, counts and booleans only.

---

## STACK

**Unchanged from [`ask-my-course.md`](./ask-my-course.md). No new dependencies.**

**Model: `gemini-3.5-flash`**, registered in `apps/api/src/ai/models.ts` as `quiz`. Question generation over a multi-session scope is the most output-heavy action in the product and the one most sensitive to the source material's notation — which is precisely what Flash-class at this tier is good at and what a cheaper tier degrades first.

**Generation config:** `temperature: 0.4`, `maxOutputTokens: 4096`. Higher than ask and check-summary: distractors need variety, and identical-feeling questions across two practices over the same session would read as generic even when correctly cited.

**Scope ceiling:** the shared 600-page limit. An exam-week practice over ten sessions of slides can approach it; `scope_too_large` names both numbers and the client offers to narrow — the student chooses which sessions to drop.

**Rate limiting:** 10 practices per student per day, shared with the action limiter. Generation is the expensive half; answering is free and unlimited.

> **Cost note.** A practice over three sessions is comparable to a single ask in input, with a larger structured response. Confirm rates against Google's official Vertex AI pricing page.

---

## SCOPE

### Create

```
packages/shared/src/practice.ts            Practice, PracticeQuestion, PracticeResult, RevisitItem
apps/api/src/ai/actions/generateQuiz.ts
apps/api/src/routes/practices.ts           create, get, answer, complete, list
apps/api/src/services/practices.ts         transactional answering, result assembly
apps/api/src/services/redactPractice.ts    the single serialization gate
apps/api/src/tasks/sweepPractices.ts       practice_abandoned after 48h

apps/web/src/practice/api.ts
apps/web/src/practice/hooks.ts
apps/web/src/routes/PracticeRun.tsx        one question at a time, no timer
apps/web/src/routes/PracticeResults.tsx    revisit first, no score
apps/web/src/components/QuestionCard.tsx
apps/web/src/components/RevisitCard.tsx
```

### Change

```
packages/shared/src/events.ts              five new AuthedEventType values
apps/api/src/ai/models.ts                  quiz entry
apps/api/src/index.ts                      mount the router
apps/web/src/router.tsx                    practice routes
apps/web/src/routes/CourseHome.tsx         "Quiz me" entry point
apps/web/src/routes/SessionDetail.tsx      "Quiz this session" — scope preset to one session
```

### Must not be touched

- **`docs/intent/**`**, **`CLAUDE.md`**, **`problem.txt`** — as established.
- **`firestore.rules`** — deny-all stands.
- **`apps/api/src/ai/runner.ts`** and **`apps/api/src/ai/validateCitations.ts`** — used as specified by `ask-my-course`. Structural checks specific to quiz live in this action's route.
- **`apps/api/src/services/summaries.ts`** — practice reads no summary and writes none.

---

## ACCEPTANCE

### One per SUCCESS signal in the intent

**1. "Students practise on individual sessions during term, not only in a block before exams."**
`practice_started` carries `scopeSize` (the length of `sessionIds`) and a server timestamp. Single-session practice is `scopeSize == 1`; an exam block is a cluster of large-scope runs in one week. Weekly practice frequency per student is a group-by over one event type, split by scope size with no join.

**2. "Practice sets get completed rather than abandoned halfway."**
Every practice ends in exactly one of `practice_completed` or `practice_abandoned`, the latter emitted by a sweeper after 48 hours. Completion rate is the ratio between them; abandonment is recorded rather than inferred from a missing event.

**3. "After a poor result, students go back to the material."**
Opening a citation from a `revisit` item emits `practice_followed` with `practiceId`, `questionId` and `sessionId`. The follow-through rate is the share of `practice_completed` events with `revisitCount > 0` that are succeeded by a `practice_followed` for the same practice.

**4. "Questions are recognizably about *their* course."**
Every question in every served practice carries a citation whose `sessionId` is in that practice's `sessionIds` and whose `page` is within the cited material's `pageCount`. A generated set containing one uncitable question is rejected whole — verified by forcing an out-of-scope citation and asserting `502 citation_invalid` with zero questions persisted.

### Derived from LIMITS

**5. Questions come from the student's material.** The scope set sent to the model contains only `ready` materials from the requested sessions of this course. No general question bank, subject template, or previously generated question is read at generation time.

**6. One session is as easy as many.** `POST /v1/courses/{id}/practices` with a single-element `sessionIds` succeeds and produces a full set. There is no minimum scope, no "not enough material" refusal above one ready material, and no separate endpoint or flow for single-session practice.

**7. Answers cannot be read ahead.** `GET …/practices/{id}` for a practice with no answered questions returns questions with no `correctIndex` and no `whyCorrect` fields present in the JSON body — asserted on the raw response, not the rendered UI. The fields appear for a question only after that question is answered.

**8. Results tell the student what to do next.** `PracticeResult.revisit` is first in the payload and every item carries `whatTheSessionSays`, a citation, and the session title. A student can go from the result to the cited page in one interaction.

**9. There is no score.** `PracticeResult`, the practice document, and every event payload contain no percentage, fraction, mark, grade, or pass/fail field. The results screen renders no "n of m" figure.

**10. Skipping is not failing.** A skipped question appears in `revisit` with `skipped: true` and `yourChoice: null`, and is rendered distinctly from an incorrect answer. No copy on the results screen describes a skip as wrong.

**11. Practice never tests what was not taught.** Every question is answerable from the cited page. A question about an objective with no material in scope cannot be generated, because it could not carry a valid citation — and that objective's absence surfaces in readiness instead.

**12. No timer exists.** No route accepts or returns a time limit, no countdown renders, and `secondsElapsed` in `practice_completed` is an operational measure never shown to the student.

**13. Sets are not reused.** Two practices generated over the same session on the same day are two independent generations with two sets of question ids. No question document is shared between practices.

**14. Cost is attributed and bounded.** After generation, `students/{uid}/usage/{yyyymm}.actionCounts.quiz` has increased by one. Answering and completing a practice increment nothing, because neither makes a model call.
