# Spec: Ask my course

Satisfies [`docs/intent/ask-my-course.md`](../intent/ask-my-course.md).

> Builds on [`set-up-a-course.md`](./set-up-a-course.md) and [`capture-a-session.md`](./capture-a-session.md). Amends neither.
>
> **This spec establishes the AI action pipeline for the whole product.** `check-my-summary`, `quiz-me` and `see-my-readiness` are three more actions on the runner defined here; they add prompts and schemas, and they do not add a second path to the model. Read this before any of them.

---

## APPROACH

**Shape chosen.** One question produces one structured model call against an explicitly enumerated set of documents, and the answer is rejected before it reaches the student if any citation it carries falls outside that set.

Six decisions carry this spec, and the first four are the architecture.

**1. Retrieval is a scope query, not a search.** The student already told us which session each file belongs to. Asking a course resolves to `sessionIds → materialIds → gs:// URIs`, and those documents go into the request. There is no vector store, no embedding step, no chunking, and no relevance ranking — because the organising work the student already did is what makes the selection correct. This is `CLAUDE.md`'s central claim, and this spec is where it is either true or not.

**2. Scope is the student's, set explicitly, and never inferred.** The default is the whole course, shown as a control rather than assumed silently. Narrowing to a session or a run of sessions is one interaction. The product never quietly decides which subset of a student's material a question "is really about" — that would be semantic retrieval reintroduced through the side door, with none of its accountability.

**3. Every document in the request is labelled with the session it came from.** The prompt carries an explicit manifest — `Document 3 = Session 5 "Entropy and the second law", lecture slides, 24 pages` — and the response schema requires citations to name a session id from that manifest. Gemini has no native citation support for supplied documents, so the labelling is what makes a citation *possible* and the validation below is what makes it *true*.

**4. Every returned session id is validated against the scope set that was actually sent. An id outside it is a hard error.** Not a warning, not a filtered-out citation, not a footnote. The runner retries once with a corrective instruction; a second violation fails the request with `citation_invalid` and the student sees an error rather than an answer. This is the one bar the intent says cannot slip, and it is enforced in our code because it cannot be delegated to the model.

**5. There is no streaming in v1.** Streaming would put tokens on screen before the citations at the end of the response could be validated — which means either showing text that validation may reject, or validating something the student has already read. The whole answer is validated, then delivered. The cost is a few seconds of waiting; the alternative is a product that occasionally shows a fabricated citation and takes it back.

**6. "Your material doesn't cover this" is a first-class, schema-level outcome.** The response carries `answered: boolean`. When false, `answer` is empty, `citations` is empty, and `missing` states plainly what the scoped material appears not to contain. This path requires no citations and is not a failure — it is the correct result, and the intent says so twice.

**Answers cite; they do not replace reading.** The answer body renders with citation chips at the same visual weight as the prose, and following one opens the cited page. The design intent is that the citation is the thing to press.

### Rejected alternatives

**Vertex AI RAG Engine, or Gemini File Search.** Rejected — and this is the alternative that would work. Both give managed retrieval and, in File Search's case, real grounding metadata for free. They are rejected because they substitute *semantic* retrieval for the *structural* retrieval that is the product's reason to exist. If a student's organising effort is not what makes retrieval work, the product is a document search tool with a study-app skin. `CLAUDE.md` names this as the deliberate fallback if scope-constrained citation proves insufficient on real material; adopting it is a product decision, not a technical one, and it is not this spec's to make.

**Trusting `groundingSupports` / `groundingChunks`.** Rejected on fact. That metadata is produced for Google Search grounding and the managed File Search store, not for documents passed inline in a request. Depending on it here would produce citations that are absent, empty, or shaped for a different retrieval mechanism.

**Filtering out-of-scope citations and returning the rest.** Rejected, and it is the tempting one. It would raise the apparent success rate and hide exactly the failure that matters. A model citing a session it was not given is a model that is not reading the documents; silently discarding the evidence of that leaves the product unable to tell a good answer from a lucky one. The invariant is only checkable if violations are loud.

**Letting the model answer from general knowledge when the material is thin.** Rejected — a direct violation of a product invariant. The prompt forbids it, the schema has no field for it, and the `answered: false` path exists precisely so the model has a correct thing to do instead.

**Blending: answer from material, then add a general-knowledge paragraph marked as such.** Rejected. The intent says answers are "never quietly blended" with general knowledge, and a marked blend is still a blend the student will read as one answer. It also destroys the citation invariant's meaning — half the answer would be uncitable by construction.

**Streaming with post-hoc citation correction.** Rejected — reasoning above.

**Conversation memory across asks.** Rejected — NOT NOW in the intent. Each ask is independent, which also keeps every request's scope explicit and every answer independently checkable.

**Questions spanning several courses.** Rejected — NOT NOW, and it would make the scope set ambiguous in exactly the way decision 2 exists to prevent.

**An agent loop that decides which sessions to open.** Rejected by `CLAUDE.md`. There is nothing to explore: the scope is known before the call, and a loop would add latency, cost, and failure modes for capability that is not used.

---

## INTERFACE

### The action runner

**This is the shared surface. Four specs depend on it.**

```ts
// packages/shared/src/actions.ts
export type ActionKind = "ask" | "explain" | "check_summary" | "quiz" | "coverage"

export interface ScopedDocument {
  index: number             // 1-based; the "Document N" the model is shown
  sessionId: string         // the durable reference; NOT the ordinal
  sessionOrdinal: number    // for rendering the label only
  sessionTitle: string
  materialId: string
  gsUri: string
  mimeType: string
  pageCount: number | null
}

export interface ScopeSet {
  courseId: string
  sessionIds: string[]      // fully enumerated. Never a wildcard at call time.
  documents: ScopedDocument[]
  estimatedPages: number    // drives the cost guard
}

export interface Citation {
  sessionId: string
  materialId: string
  page: number | null       // null for non-paginated material
}
```

```ts
// apps/api/src/ai/runner.ts
export interface ActionDefinition<TInput, TOutput> {
  kind: ActionKind
  model: ModelId                        // from ai/models.ts, never a literal
  requiresCitations: boolean
  responseSchema: Schema                // Vertex responseSchema
  buildPrompt(input: TInput, scope: ScopeSet): string
  parse(raw: unknown): TOutput          // shape only; no scope knowledge
  citationsOf(output: TOutput): Citation[]
}

export interface ActionResult<TOutput> {
  output: TOutput
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number }
  costMicros: number
  ms: number
  attempts: number                      // 1, or 2 after a citation retry
  cacheHit: boolean
}

export function runAction<TIn, TOut>(
  def: ActionDefinition<TIn, TOut>,
  input: TIn,
  scope: ScopeSet,
  ctx: { uid: string; courseId: string; studySessionId?: string },
): Promise<ActionResult<TOut>>
```

`runAction` executes, in order:

1. **Guard the scope.** Empty scope → `scope_empty`. Over the page ceiling → `scope_too_large`, naming the number and the limit. Materials not `ready` are excluded and counted.
2. **Build the request.** Manifest header, then each document as a `fileData` part carrying its `gs://` URI and MIME type. Bytes are never inlined.
3. **Attach the cache** when a `studySessionId` is supplied and a live cache exists for this scope.
4. **Call Gemini** with `responseMimeType: "application/json"` and the definition's `responseSchema`.
5. **Parse**, then **validate citations** — the step below.
6. **Account** for usage and cost; emit the action event.

### The citation validator

```ts
// apps/api/src/ai/validateCitations.ts
export class CitationScopeError extends Error {
  readonly offending: Citation[]
  readonly scopeSessionIds: string[]
}

validateCitations(citations: Citation[], scope: ScopeSet, opts: { required: boolean }): void
```

Every citation must satisfy **all** of:

- `sessionId` ∈ `scope.sessionIds` — **the non-negotiable check**;
- `materialId` ∈ the documents sent for that session;
- `page` is null, or `1 ≤ page ≤ pageCount` for that material.

When `required` is true and the citation array is empty, that is also a violation.

On violation the runner retries **once**, appending a corrective instruction that names the permitted session ids and states that the previous response cited outside them. A second violation throws; the route returns `502 { error: "citation_invalid" }` and **no answer text reaches the client**. Both attempts emit `citation_violation` with the offending ids, because a violation rate is the health metric for the entire retrieval thesis.

`answered: false` responses are validated with `required: false`.

### Routes

```
POST /v1/courses/{courseId}/ask
  Body:     { question: string (1..1000),
              scope: { sessionIds?: string[] },      // omitted = whole course
              studySessionId?: string }
  200:      AskAnswer
  400:      { error: "scope_empty" }
            { error: "scope_too_large", pages: number, limit: number }
  429:      { error: "rate_limited", retryAfterSeconds: number }
  502:      { error: "citation_invalid" }   — never accompanied by answer text
  504:      { error: "model_timeout" }

POST /v1/courses/{courseId}/explain
  Body:     { materialId, page?, selection?: string (1..2000),
              scope?, studySessionId? }
  200:      AskAnswer
  Same runner, same validator, a different prompt. "Explain this" is a question
  whose subject is a passage rather than a sentence the student typed.

POST /v1/courses/{courseId}/study-sessions
  Body:     { sessionIds?: string[] }
  201:      { studySessionId: string, expiresAt: string, cached: boolean }
  Opens a context cache over the scope. `cached: false` when the scope is under
  the 2,048-token minimum, in which case the id still works and simply caches nothing.

GET /v1/courses/{courseId}/asks?limit=20&cursor=
  200:      { asks: AskRecord[], nextCursor: string | null }
  The student's own history. No context from it is ever fed back to the model.
```

### Response shape

```ts
// packages/shared/src/ask.ts
export interface AskAnswer {
  id: string
  answered: boolean
  answer: string              // "" when answered is false
  citations: Citation[]       // [] when answered is false
  missing: string | null      // set only when answered is false
  scopeSessionIds: string[]   // what was actually sent — echoed for the UI
  createdAt: string
}
```

The `responseSchema` given to Vertex mirrors this exactly, with `answered`, `answer`, `citations` and `missing` all required and `citations[].sessionId` typed as a string enum **restricted to the scope's session ids**. Constraining the enum makes most violations impossible rather than merely detectable; the validator remains because a schema is a request, not a guarantee.

### Prompt contract

The system instruction states, in order: answer only from the supplied documents; never use knowledge from outside them; if the documents do not support an answer, set `answered: false` and say in `missing` what appears to be absent; cite every claim with the session id from the manifest; use the notation and terminology the documents use, not a standard textbook's.

The manifest is rendered per document:

```
Document 3 = Session 5 (id: s_9f2a...) "Entropy and the second law" — lecture slides, 24 pages
```

The id is what the model must return. The ordinal and title are there so it can tell the documents apart.

### Client

```ts
// apps/web/src/ask/api.ts
ask(courseId, input: { question: string; sessionIds?: string[]; studySessionId?: string }): Promise<AskAnswer>
explain(courseId, input: { materialId: string; page?: number; selection?: string }): Promise<AskAnswer>
openStudySession(courseId, sessionIds?: string[]): Promise<{ studySessionId: string }>
listAsks(courseId, cursor?): Promise<{ asks: AskRecord[]; nextCursor: string | null }>
```

### Events

```ts
export type AuthedEventType =
  | ...                    // established in earlier specs
  | "ask_submitted"        // meta: { courseId, scopeSize, scopePages, studySessionId? }
  | "ask_answered"         // meta: { askId, answered, citationCount, ms, cacheHit,
                           //         inputTokens, outputTokens, costMicros }
  | "ask_uncovered"        // meta: { askId } — answered:false; a coverage signal, not an error
  | "citation_followed"    // meta: { askId, sessionId, page }
  | "citation_violation"   // meta: { kind, attempt, offendingCount } — NO ids, NO content
  | "action_failed"        // meta: { kind, error }
```

`citation_followed` is the intent's second success signal — students following citations back into the source — and it is emitted by the client when a chip is opened, not inferred from a material read.

---

## DATA LAYER

### Firestore

```
students/{uid}/courses/{courseId}/asks/{askId}
  question        string            // the student's words
  answered        boolean
  answer          string
  citations       array<{ sessionId, materialId, page }>
  missing         string | null
  scopeSessionIds array<string>     // what was sent, for after-the-fact audit
  model           string            // the pinned model id used
  usage           map               // inputTokens, outputTokens, cachedTokens
  costMicros      number
  ms              number
  attempts        number
  createdAt       Timestamp

students/{uid}/courses/{courseId}/studySessions/{studySessionId}
  sessionIds      array<string>
  cacheName       string | null     // Vertex cache resource, null when under minimum
  expiresAt       Timestamp
  createdAt       Timestamp

students/{uid}/usage/{yyyymm}
  actionCounts    map<ActionKind, number>
  costMicros      number
  inputTokens     number
  outputTokens    number
  updatedAt       Timestamp
```

`scopeSessionIds` is stored on every ask so that a citation can be re-checked months later against what was actually sent. Without it, an audit of the invariant would have to reconstruct the scope from a course that has since changed.

`students/{uid}/usage/{yyyymm}` is incremented transactionally on every action, by every spec that uses the runner. It is the per-student cost figure `know-its-working` reads, and it exists so that answering "what does this student cost" never requires scanning their content.

### Context caching

A cache is created when a study session opens, over the scope's documents, with **TTL 1 hour**, and is allowed to expire. It is never created per-semester or per-course-lifetime.

The reasoning is in `CLAUDE.md` and is a cost decision, not a performance one: cache *reads* cost roughly 10 % of input, but cache *storage* bills by the token-hour. A semester-long cache over a student's whole course would bill continuously for material read a few times a week. An hour matches how studying actually happens — a student opens a course, asks six questions, closes it.

Below the 2,048-token minimum no cache is created and the study session id still functions; the caller does not branch.

### Deliberately not stored

- **No vector index, embeddings, or chunk table.** The absence is the architecture.
- **No conversation thread or message history fed back to the model.** Asks are stored for the student to re-read and for the invariant to be audited. Nothing reads them into a later prompt.
- **No cached answers keyed by question text.** Two identical questions against changed material must produce answers from the current material.
- **No raw model response.** The parsed, validated result is stored. An unvalidated response is exactly the thing this spec exists to keep away from the student.
- **No question or answer text in `events`.** Event meta carries counts, timings and costs. `citation_violation` deliberately carries neither the offending ids' content nor the question — the operator needs the rate, not the material.

---

## STACK

Extends [`capture-a-session.md`](./capture-a-session.md). **No new packages** — `@google/genai` 2.20.0 arrived with `set-up-a-course`.

**Models** (pinned in `apps/api/src/ai/models.ts`, the only place any id is written):

| Purpose | Model | Why |
|---|---|---|
| `ask`, `explain` | **`gemini-3.5-flash`** | Grounded reading over mixed-language lecture material with structured output. Near-Pro quality at Flash cost, which is what makes the unit economics work. |
| syllabus extraction | `gemini-3.5-flash-lite` | set by `set-up-a-course` |
| Pro-class escape hatch | `gemini-3.1-pro` | **Named, not used.** Reserved for grounded Q&A *only if* an eval shows Flash-class insufficient, per `CLAUDE.md`. Switching is a one-line change here and a cost decision elsewhere. |

**Generation config:** `temperature: 0.2`, `responseMimeType: "application/json"`, `responseSchema` per action, `maxOutputTokens: 2048` for ask and explain. Low temperature because the task is reading, not composition.

**Scope ceiling:** 600 pages per request, well under Gemini's 1,000-page PDF limit. Pages bill as images, so this is the cost guard, not the capability limit. Over it, the request is refused with `scope_too_large` naming both numbers, and the client offers to narrow the scope — the student decides which sessions to drop, as decision 2 requires.

**Rate limiting:** 30 asks per student per hour, 300 per day, enforced in the API against the `usage` document. A student who hits it is told the limit and when it resets. This is a cost guard against a runaway loop, not a study limit; the numbers are far above realistic use.

**Timeouts:** 60s model call, 90s Cloud Run request. A timeout returns `504 model_timeout` and is retryable by the student.

> **Cost note.** A typical ask against three sessions of slides is roughly 60–70 page-images plus a short response. Confirm current per-image and per-token rates against Google's official Vertex AI pricing page — figures quoted in project documents are not a source.

---

## SCOPE

### Create

```
packages/shared/src/actions.ts             ActionKind, ScopeSet, ScopedDocument, Citation
packages/shared/src/ask.ts                 AskAnswer, AskRecord

apps/api/src/ai/runner.ts                  runAction — THE shared pipeline
apps/api/src/ai/validateCitations.ts       the invariant
apps/api/src/ai/scope.ts                   resolveScope(courseId, sessionIds?) -> ScopeSet
apps/api/src/ai/manifest.ts                document manifest rendering
apps/api/src/ai/cache.ts                   context cache create / lookup / expiry
apps/api/src/ai/cost.ts                    usage accounting, usage/{yyyymm} increments
apps/api/src/ai/actions/ask.ts             ActionDefinition for ask
apps/api/src/ai/actions/explain.ts         ActionDefinition for explain

apps/api/src/routes/ask.ts                 POST /ask, POST /explain, GET /asks
apps/api/src/routes/studySessions.ts
apps/api/src/services/asks.ts
apps/api/src/middleware/actionRateLimit.ts

apps/web/src/ask/api.ts
apps/web/src/ask/hooks.ts
apps/web/src/routes/Ask.tsx                question, scope control, answer
apps/web/src/components/ScopeControl.tsx   the explicit scope selector
apps/web/src/components/CitationChip.tsx
apps/web/src/components/SourcePanel.tsx    opens the cited page beside the answer
apps/web/src/components/UncoveredAnswer.tsx
```

### Change

```
packages/shared/src/events.ts              six new AuthedEventType values
apps/api/src/ai/models.ts                  add the ask/explain and Pro-class entries
apps/api/src/index.ts                      mount routers
apps/web/src/router.tsx                    ask routes
apps/web/src/routes/CourseHome.tsx         "Ask this course" entry point
apps/web/src/routes/SessionDetail.tsx      "Ask this session" — scope preset to one session
```

### Must not be touched

- **`docs/intent/**`**, **`CLAUDE.md`**, **`problem.txt`** — as established.
- **`firestore.rules`** — deny-all stands.
- **`apps/api/src/services/materials.ts`** and the processing task — asking reads materials; it does not alter, re-derive, or re-process them.
- **`apps/api/src/ai/extractObjectives.ts`** — the one model call that is deliberately outside the runner, because it cites pages of a document rather than sessions. It stays outside.

### Established here, and binding on `check-my-summary`, `quiz-me` and `see-my-readiness`

**`runAction` is the only path from the product to a model** (extraction excepted, above). **`validateCitations` runs on every action that returns citations, and a violation is a hard failure.** **Scope is resolved from explicit session ids and enumerated before the call.** **Usage and cost are accounted on every action into `usage/{yyyymm}`.** **No streaming.** A later spec that needs a new capability adds an `ActionDefinition`; it does not add a second call site.

---

## ACCEPTANCE

### One per SUCCESS signal in the intent

**1. "Answers cite a session, and the citation is correct when checked."**
For any answer with `answered: true`, every `citations[].sessionId` is a member of the `scopeSessionIds` stored on that same ask record, and every `page` is within the cited material's `pageCount`. This is assertable over the entire `asks` collection as a query, not a sample. A synthetic test that forces the model to name an out-of-scope session produces `502 citation_invalid` and **zero** answer text in the response body — verified by asserting the body has no `answer` field, not merely that the UI hides it.

**2. "Students follow citations back into the source material rather than reading only the answer."**
Opening a citation chip emits `citation_followed` with `askId`, `sessionId` and `page`. The follow rate is `distinct askId in citation_followed ÷ count(ask_answered where answered)`, computable without reading any question or answer.

**3. "Students ask repeatedly across a term, not once."**
`ask_submitted` carries `courseId` and a server timestamp. Asks per student per ISO week is a group-by over one event type.

**4. "When the material genuinely does not cover a question, the student learns that now."**
A question about a topic present in no scoped document returns `answered: false`, an empty `citations` array, and a non-empty `missing` naming what appears absent. It emits `ask_uncovered`. The client renders this as a plain statement, not as an error state and not as a retry prompt.

### Derived from LIMITS

**5. Answers are built only from the student's material.** Given a course whose scoped material contains no mention of a topic the model certainly knows from pretraining, the answer is `answered: false`. It does not answer correctly from general knowledge, and it does not answer partially and mark the addition.

**6. An untraceable answer is not shown.** There is no code path that returns `answered: true` with an empty `citations` array — `requiresCitations` is true for ask and explain, and the validator rejects the empty case before the route serialises anything.

**7. Scope is the student's.** The request carries the session ids used. No server code widens, narrows, re-ranks, or re-selects the scope between resolution and the model call. Passing three session ids sends exactly those sessions' ready materials, and `scopeSessionIds` on the stored ask equals the three.

**8. Nothing is inferred from the question text.** Two different questions submitted with identical `sessionIds` produce identical `scopeSessionIds` and identical document manifests. Scope is a function of the student's selection alone.

**9. The invariant is measurable, not hoped for.** `citation_violation` is emitted on every attempt that fails validation, including the first of a successful retry. A violation rate per model, per action and per week is queryable. It carries no question, answer, or material content.

**10. Retry is bounded and honest.** A citation violation triggers exactly one retry. `attempts` on the stored ask is 1 or 2 and never more. Two failures produce an error, never a third attempt and never a degraded answer.

**11. Answering does not substitute for reading.** Every rendered answer carries at least one citation chip that opens the cited page. There is no "just tell me" affordance, no answer-only view that hides citations, and no path that marks material as read on the student's behalf.

**12. Courses do not mix.** Every route takes a `courseId` and resolves scope beneath it. A `sessionIds` array containing an id from another course yields `400 scope_empty` for the foreign ids or a 404 for the course — never a request spanning two courses.

**13. No conversation memory.** Two consecutive asks in one study session produce two independent requests. Neither prompt contains the other's question, answer, or any summary of it. Verified by inspecting the outbound request bodies.

**14. Caching is bounded to a study session.** A context cache is created with a TTL of one hour and is never refreshed on read. No cache resource outlives the study session that created it, and none is created per-course or per-term.

**15. Cost is attributed per student.** After any ask, `students/{uid}/usage/{yyyymm}.costMicros` has increased by the amount recorded on the ask, and `actionCounts.ask` by one. The monthly cost of a student is one document read.

**16. Bytes are never re-uploaded.** The outbound request to Vertex carries `fileData` parts holding `gs://` URIs. No request contains base64 document content, and material is not downloaded by the API to construct a request.
