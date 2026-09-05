# Spec: Capture a session

Satisfies [`docs/intent/capture-a-session.md`](../intent/capture-a-session.md).

> Builds on [`set-up-a-course.md`](./set-up-a-course.md) and extends its **upload protocol**. Amends no earlier spec.

---

## APPROACH

**Shape chosen.** A session is a document under its course — `students/{uid}/courses/{courseId}/sessions/{sessionId}` — holding a date, a title, and two independent kinds of child: **materials** (files) and **summaries** (the student's own words). Either may be absent. Neither blocks the other.

Five decisions carry this spec.

**1. The session record is created first, and immediately.** A session exists as soon as the student says a class happened — before any file has uploaded, before anything is processed. Everything else attaches to it afterwards. This is what makes capture work in a corridor: the thing that must not be lost is the *fact of the class and what it was about*, and that is two short strings.

**2. Uploads are queued on the device, not in the request.** The client writes the session and its pending files to IndexedDB, then drains that queue against the network as it becomes available. A student who taps Save on a dying connection has already succeeded from their point of view; the bytes follow. This is the whole of the intent's "works from a phone in the corridor outside the lecture hall, on a bad connection", and it is a client-side decision — the server needs no notion of offline.

**3. Files above 8 MB use GCS resumable uploads, not a single signed PUT.** A simple PUT that dies at 90 % on a bad connection restarts from zero, which on a lecture-hall connection means it never finishes. Resumable sessions survive interruption and resume at the byte offset. Below the threshold the extra round trip is not worth it.

**4. Processing is deferred, and the student is never blocked by it.** Enqueued to Cloud Tasks; the session and its material are visible and usable the moment the upload lands. Processing does mechanical work only — convert Office formats to PDF, count pages, render a cover — and its failure degrades one material rather than losing a session. This is the mirror image of `set-up-a-course`'s synchronous extraction, and the distinguishing question is the same one: nobody is waiting.

**5. Conversion runs in a second Cloud Run service.** LibreOffice is roughly a gigabyte of container image. Putting it in the API image would impose that cold start on every authenticated request in the product, to serve the minority of uploads that are `.pptx`. The converter is a separate, private service the processing task calls; the API image stays small.

**Ordinals are for display; ids are for reference.** A session carries `ordinal` — "Session 5" — derived from date order within the course and **recomputed when a session is inserted out of order**. Nothing durable ever references an ordinal. Citations, evidence links and scope sets all use `sessionId`, so a student adding a missed week-3 lecture in week 9 renumbers what they see and invalidates nothing.

**The invitation to write is never a requirement, and never a nag.** The summary field is present on the capture screen, prefilled with nothing, and Save is enabled whether or not it is used. There is no reminder, no streak, no badge, and no later prompt. A session with no summary displays a plain affordance to add one and no admonition for its absence.

### Rejected alternatives

**One "session" document holding materials as an array.** Rejected. Materials have independent lifecycles — uploading, converting, failing, being deleted — and an array means a read-modify-write per state transition, from a background task, racing the student's own edits.

**Uploading through the API so the server can validate content.** Rejected — established in `set-up-a-course` and reaffirmed here at larger sizes. A 2 GB ceiling through a request handler is not a ceiling that exists.

**Synchronous processing, so the student sees page counts immediately.** Rejected. It would put a LibreOffice cold start between a student and their own file, and would fail the upload when conversion fails. Page count is not needed to make a session useful.

**Pub/Sub instead of Cloud Tasks for the processing queue.** Rejected. Processing is explicit deferred work with one consumer and a known endpoint, and it benefits from per-queue rate limiting to bound converter concurrency and cost. Pub/Sub's fan-out and at-least-once out-of-order delivery buy nothing here. Handlers are idempotent regardless, keyed on `materialId`.

**Extracting text from documents on upload and storing it.** Rejected, and this is the one that would quietly undo the architecture. It is the first step toward a parsed corpus, then chunks, then embeddings — the retrieval stack `CLAUDE.md` deliberately does not have. Gemini reads the `gs://` object directly; a second parsed copy would drift from the file, would double what deletion must reach, and would buy nothing the model does not already do.

**Server-rendered thumbnails for every page.** Rejected. It is a render per page per upload, billed and stored, to populate a grid the student scrolls past. The server renders **one** cover image per material; the page grid renders client-side from the PDF with `pdfjs-dist`, which the browser has already downloaded to display it.

**Auto-titling the session from the uploaded file.** Rejected. `Lecture4_final_v2.pdf` is exactly the anonymous string the intent wants replaced, and a model-generated title would be the product deciding what the class was about. The student types a few words; that is the point.

**Reminders to capture, or a streak.** Rejected — NOT NOW in the intent, and directly against it: "students fall behind; the product absorbs that rather than moralizing about it."

**Lecture audio recording.** Out of scope for v1 by `CLAUDE.md`.

---

## INTERFACE

All routes under `/v1`, all `requireAuth()`, all scoped to the caller's subtree.

### Routes

```
POST /v1/courses/{courseId}/sessions
  Body:     { title: string (1..160), heldOn: string (YYYY-MM-DD),
              clientSessionId?: string (uuid v4) }
  201:      Session
  409:      { error: "session_limit_reached" }      — 200 sessions per course
  `clientSessionId` makes creation idempotent: replaying a queued create after a
  dropped response returns the existing session with 200, never a duplicate.

GET /v1/courses/{courseId}/sessions
  Query:    ?limit=50&cursor=<opaque>
  200:      { sessions: SessionSummary[], nextCursor: string | null }
            Ordered by heldOn desc, then createdAt desc.

GET /v1/courses/{courseId}/sessions/{sessionId}
  200:      Session & { materials: Material[], summaries: SummaryRef[] }

PATCH /v1/courses/{courseId}/sessions/{sessionId}
  Body:     { title?, heldOn?, objectiveIds?: string[] }
  200:      Session
  Changing heldOn recomputes ordinals across the course in one transaction.

DELETE /v1/courses/{courseId}/sessions/{sessionId}
  202:      { status: "accepted" }

POST /v1/courses/{courseId}/sessions/{sessionId}/materials
  Body:     { filename, contentType, sizeBytes, kind: MaterialKind }
  201:      { materialId, upload: SimpleUpload | ResumableUpload }
  400:      { error: "unsupported_type" | "too_large" }
  Returns a signed PUT for files ≤ 8 MB, a resumable session URI above it.

POST /v1/courses/{courseId}/sessions/{sessionId}/materials/{materialId}:complete
  200:      Material                                 — status "stored" or "processing"
  409:      { error: "object_missing" | "size_mismatch" }
  Verifies the object, then enqueues processing. Idempotent.

GET /v1/courses/{courseId}/sessions/{sessionId}/materials/{materialId}/url
  200:      { readUrl: string, expiresAt: string }   — V4 signed GET, 15 minutes
  The only way a client ever reads material bytes. No object is public.

DELETE /v1/courses/{courseId}/sessions/{sessionId}/materials/{materialId}
  204:      —

PUT /v1/courses/{courseId}/sessions/{sessionId}/summary
  Body:     { text: string (1..8000) }
  201:      Summary                                  — a new revision, always
  Never overwrites. Each submission is a new document; the newest is current.

POST /v1/internal/materials/{materialId}:process
  Auth:     Cloud Tasks OIDC token, service account only. Not reachable publicly.
  202:      {}
```

### Shared types

```ts
// packages/shared/src/session.ts
export type MaterialKind = "slides" | "photo" | "document" | "other"

export type MaterialStatus =
  | "pending"      // record exists, bytes not yet confirmed
  | "stored"       // bytes present, nothing further needed
  | "processing"   // conversion or page count in flight
  | "ready"        // usable by AI actions
  | "failed"       // see failureReason; the session is unaffected

export interface Session {
  id: string
  courseId: string
  title: string
  heldOn: string              // YYYY-MM-DD, the student's own date
  ordinal: number             // 1-based within course, by heldOn; DISPLAY ONLY
  objectiveIds: string[]      // 0..n, student-assigned
  materialCount: number
  hasSummary: boolean
  createdAt: string
  updatedAt: string
  schemaVersion: number
}

export interface Material {
  id: string
  kind: MaterialKind
  filename: string
  contentType: string
  sizeBytes: number
  status: MaterialStatus
  failureReason: string | null
  gsUri: string               // the object the model reads, post-conversion
  originalGsUri: string       // what the student uploaded, kept verbatim
  pageCount: number | null    // PDFs only; drives cost estimation
  coverGsUri: string | null
  createdAt: string
}

export interface Summary {
  id: string
  sessionId: string
  text: string
  wordCount: number
  revision: number            // 1-based
  createdAt: string
  // `feedback` is added by check-my-summary.md. Absent here.
}
```

### Accepted material

| Kind | MIME types | Ceiling |
|---|---|---|
| `slides` | `application/pdf`, `…presentationml.presentation` (`.pptx`), `…ms-powerpoint` | 100 MB · 300 pages |
| `document` | `application/pdf`, `…wordprocessingml.document` (`.docx`), `text/plain`, `text/markdown` | 100 MB |
| `photo` | `image/jpeg`, `image/png`, `image/webp`, `image/heic` | 25 MB each |
| `other` | any of the above | as above |

**PDFs are additionally capped at 50 MB and 1,000 pages by Gemini** ([`CLAUDE.md`](../../CLAUDE.md)). The 300-page ceiling here is tighter on purpose: PDF pages are billed and tokenised as images, so a 900-page deck is a cost event, not a capability. A file inside the platform limit but over the product limit is accepted, stored, and marked `failed` with `failureReason: "too_many_pages"` — the student keeps their file and is told plainly why it cannot be asked questions.

HEIC is converted to JPEG during processing; every other image is stored as uploaded.

### Processing task

```ts
// apps/api/src/tasks/processMaterial.ts
processMaterial(materialId: string): Promise<void>
// 1. Load the material; if status is already "ready" or "failed", return. (Idempotent.)
// 2. Office format?  POST the object to the converter service, receive a PDF, store it.
//    HEIC?           convert to JPEG.
//    Otherwise       gsUri = originalGsUri.
// 3. PDF? count pages. Over the product ceiling -> "failed", reason "too_many_pages".
// 4. Render a cover image (first page, or the photo downscaled to 640px).
// 5. status = "ready"; emit material_ready.
// Any throw -> status "failed" with a reason from a closed set. Cloud Tasks retries
// transient failures 5 times with exponential backoff; a terminal failure does not retry.
```

### Converter service

```
POST /convert     multipart: file
  200: application/pdf
  415: { error: "unsupported_format" }
  Private Cloud Run service. Ingress internal-only; invoked with the API's
  service account identity. No public route, no student data at rest, no auth
  of its own beyond IAM — it never sees a uid and keeps nothing.
```

### Client

```ts
// apps/web/src/sessions/api.ts
createSession(courseId, input: { title; heldOn; clientSessionId }): Promise<Session>
listSessions(courseId, cursor?): Promise<{ sessions: SessionSummary[]; nextCursor: string | null }>
getSession(courseId, sessionId): Promise<SessionDetail>
updateSession(courseId, sessionId, patch): Promise<Session>
addMaterial(courseId, sessionId, file: File, kind: MaterialKind): Promise<Material>
getMaterialUrl(courseId, sessionId, materialId): Promise<{ readUrl: string }>
saveSummary(courseId, sessionId, text: string): Promise<Summary>

// apps/web/src/sessions/queue.ts   — the offline half
enqueueSession(draft: SessionDraft): Promise<void>   // IndexedDB, survives reload
drainQueue(): Promise<void>                          // called on online + on load
useQueueState(): { pending: number; failed: number }
```

### Events

```ts
export type AuthedEventType =
  | ...                    // established in earlier specs
  | "session_created"        // meta: { courseId, sessionId, daysAfterHeldOn, queued }
  | "material_added"         // meta: { materialId, kind, sizeBytes, resumable }
  | "material_ready"         // meta: { materialId, pageCount, ms }
  | "material_failed"        // meta: { materialId, reason }
  | "summary_written"        // meta: { sessionId, wordCount, revision,
                             //         hoursAfterSessionHeld }
```

`daysAfterHeldOn` is the intent's first success signal made directly measurable — capture within a day or two, versus a panicked batch before exams — without any later join. `queued` records whether the session was created offline and drained later, so the corridor case is distinguishable from the desk case.

---

## DATA LAYER

### Firestore

```
students/{uid}/courses/{courseId}/sessions/{sessionId}
  title           string
  heldOn          string            // "YYYY-MM-DD"
  ordinal         number            // display only; recomputed on insert/move
  objectiveIds    array<string>     // ids within this course
  materialCount   number
  hasSummary      boolean
  clientSessionId string | null     // idempotency key for offline replay
  createdAt       Timestamp
  updatedAt       Timestamp
  schemaVersion   number            // 1

students/{uid}/courses/{courseId}/sessions/{sessionId}/materials/{materialId}
  kind, filename, contentType, sizeBytes
  status          string            // MaterialStatus
  failureReason   string | null
  gsUri           string
  originalGsUri   string
  pageCount       number | null
  coverGsUri      string | null
  createdAt       Timestamp

students/{uid}/courses/{courseId}/sessions/{sessionId}/summaries/{summaryId}
  text            string            // the student's words, verbatim
  wordCount       number
  revision        number
  createdAt       Timestamp
```

**Indexes.** A composite index on `sessions` by `(heldOn desc, createdAt desc)` for the timeline, and one on `materials` by `(status, createdAt)` for the failure sweeper. Both are collection-group-free — every query is already inside one student's subtree.

**`originalGsUri` is never deleted when conversion succeeds.** A `.pptx` a student uploaded stays a `.pptx` they can download. The converted PDF is a derivative the product made for its own use, and losing the original to save storage would be taking something from the student to save a fraction of a cent.

### Cloud Storage

```
students/{uid}/courses/{courseId}/sessions/{sessionId}/materials/{materialId}/
    original/{filename}          as uploaded
    converted/document.pdf       only when conversion happened
    cover/cover.jpg              one image
```

Lifecycle rule: objects under any `uploads/` prefix (the `set-up-a-course` staging area) are deleted after 24 hours. Material prefixes have **no** lifecycle rule — a student's material is theirs until they delete it or their account.

### Deliberately not stored

- **Extracted text, chunks, embeddings, or any parsed representation of a document.** The architecture's central claim is that structure replaces retrieval; a parsed corpus is the first half of the stack it replaces.
- **Lecture audio or any transcript.** Out of v1 scope.
- **Per-page thumbnails.** One cover per material; the page grid renders client-side.
- **A `viewedAt` or read-state per material.** Nothing in the product reads it, and it is a write per scroll.
- **Original upload IP, device model, or connection type.** `queued` records that a session was captured offline. It does not record where or on what.
- **Anything at rest in the converter service.** It receives bytes, returns bytes, and keeps nothing; it never learns which student a file belongs to.

---

## STACK

Extends [`set-up-a-course.md`](./set-up-a-course.md). **Three additions.**

| Component | Version | Where |
|---|---|---|
| `@google-cloud/tasks` | **6.x** | API — enqueue processing |
| `pdf-lib` | **1.17.x** | API/task — page counting, no rendering |
| `pdfjs-dist` | **5.x** | Web — client-side page grid |

Converter service image: `debian:bookworm-slim` + `libreoffice-impress` + `libreoffice-writer`, headless, no fonts beyond the base set plus a Noto Arabic face. Node 24.x runtime, `hono` 4.13.5 for the single route.

Cover rendering uses **ImageMagick** (`imagemagick` package) already present in the converter image, invoked over the converted PDF. It is not added to the API image.

**Cloud Tasks queue** `material-processing`: max 10 concurrent dispatches, 5 max attempts, 10s min backoff, 600s max. The concurrency cap is the cost control on the converter — a student uploading twenty decks at once does not spin up twenty LibreOffice containers.

**Cloud Run services**

| Service | Ingress | Min instances | Notes |
|---|---|---|---|
| `aitutor-api` | public | 0 | small image; every authenticated request |
| `aitutor-convert` | internal only | 0 | ~1 GB image; invoked by the processing task |

No model call exists anywhere in this spec. Capture is mechanical, and that is why it is cheap.

---

## SCOPE

### Create

```
packages/shared/src/session.ts             Session, Material, Summary, MaterialKind/Status

apps/api/src/routes/sessions.ts
apps/api/src/routes/materials.ts
apps/api/src/routes/summaries.ts           PUT …/summary
apps/api/src/routes/internal/process.ts    Cloud Tasks target, OIDC-verified
apps/api/src/services/sessions.ts          incl. ordinal recomputation
apps/api/src/services/materials.ts
apps/api/src/services/summaries.ts
apps/api/src/tasks/enqueue.ts              Cloud Tasks client
apps/api/src/tasks/processMaterial.ts
apps/api/src/middleware/oidc.ts            verify Cloud Tasks caller identity

services/convert/Dockerfile                LibreOffice + ImageMagick
services/convert/src/index.ts              POST /convert

apps/web/src/sessions/api.ts
apps/web/src/sessions/queue.ts             IndexedDB queue, drain on reconnect
apps/web/src/sessions/hooks.ts
apps/web/src/routes/SessionNew.tsx         the corridor screen
apps/web/src/routes/SessionDetail.tsx
apps/web/src/components/PageGrid.tsx       pdfjs-dist rendering
apps/web/src/components/OfflineBanner.tsx
```

### Change

```
packages/shared/src/events.ts              five new AuthedEventType values
apps/api/src/services/uploads.ts           resumable sessions above 8 MB
apps/api/src/services/courses.ts           maintain sessionCount
apps/api/src/index.ts                      mount routers
apps/web/src/router.tsx                    session routes
apps/web/src/routes/CourseHome.tsx         the session timeline, previously a shell
```

### Must not be touched

- **`docs/intent/**`**, **`CLAUDE.md`**, **`problem.txt`** — as established.
- **`firestore.rules`** — deny-all stands.
- **`apps/api/src/middleware/auth.ts`** and **`apps/api/src/ai/**`** — capture makes no model call and needs no change to either.
- **`apps/api/src/services/objectives.ts`** — sessions *reference* objective ids; they do not create, reword, or reorder them.

### Established here, and binding on every later spec

**Materials are addressed by `gs://` URI and read by the model by reference.** **`sessionId` is the durable reference; `ordinal` is display only.** **Cloud Tasks is the deferred-work mechanism**, with idempotent handlers keyed on the entity id. The **summary document shape** — text, wordCount, revision, append-only — which [`check-my-summary.md`](./check-my-summary.md) extends with feedback and does not restructure.

---

## ACCEPTANCE

### One per SUCCESS signal in the intent

**1. "Sessions are captured within a day or two of the class, rather than in a panicked batch before exams."**
Every session emits `session_created` carrying `daysAfterHeldOn = createdAt.date − heldOn`. The distribution of that number over a cohort is the signal, requiring no join and no inference. A batch before exams is visible as a cluster of high values sharing one `createdAt` day.

**2. "Sessions keep being added past week three."**
`session_created` carries `courseId` and a server timestamp. Sessions per course per ISO week is a group-by over one event type. Week-three survival is a cohort comparison on `course_created.at`, using fields already specified in `set-up-a-course`.

**3. "A meaningful share of sessions carry the student's own words, not only an attached file."**
`hasSummary` is maintained on the session document, so the share is `count(hasSummary) ÷ count(sessions)` directly from the database, and separately as a ratio of `summary_written` to `session_created` in the event stream. The two must agree.

**4. "A student can find a specific session's material months later without hunting for it."**
`GET /v1/courses/{id}/sessions` returns sessions ordered by `heldOn desc` with title, ordinal, material count and summary flag in the list payload — no per-session fetch to render the timeline. A named session and its files are reachable in two navigations from the courses list.

### Derived from LIMITS

**5. Capture works with a file and nothing to say.** A session created with one photograph and an empty summary field saves successfully, renders normally, and displays no warning, badge, or prompt about the missing summary — only a plain affordance to add one.

**6. Capture works with words and no file.** A session created with a summary and no material saves successfully and is usable.

**7. The summary is never written for the student.** No route, task, or client function in this spec generates summary text. `PUT …/summary` stores exactly the bytes submitted; `wordCount` is derived and `text` is untouched. There is no endpoint that produces a draft.

**8. Offline capture survives.** With the network disabled, creating a session with a 12 MB attachment completes from the student's point of view and persists across a full page reload. On reconnect the queue drains, the session appears server-side exactly once, and `session_created.meta.queued` is `true`. Replaying the same `clientSessionId` returns the existing session with 200 and creates no duplicate.

**9. A bad connection does not lose a large upload.** A 40 MB PDF interrupted at roughly 50 % resumes from the byte offset when connectivity returns and completes without re-sending the first half.

**10. Late and out-of-order capture carries no penalty.** A session added with a `heldOn` two months in the past is accepted, renumbers the course's ordinals correctly, and triggers no warning. No copy anywhere in the capture flow refers to being behind, catching up, or missing sessions.

**11. Renumbering breaks nothing.** After inserting an earlier session, every `objectiveIds` reference, every stored citation, and every scope set still resolves — because all of them hold `sessionId`. Displayed ordinals shift; nothing else does.

**12. A failed material does not damage a session.** Given a corrupt `.pptx`, processing marks that material `failed` with a reason from the closed set, the session and its other materials remain fully usable, and the student sees which file failed and why.

**13. Over-long documents are refused honestly.** A 1,200-page PDF is stored, marked `failed` with `too_many_pages`, remains downloadable by the student, and is excluded from AI scope. It is not silently truncated to the first 300 pages.

**14. Material is private.** No Cloud Storage object is publicly readable. The only path to bytes is a 15-minute V4 signed URL issued by an authenticated route, and a URL issued for student A's material is issued only to student A.

**15. Nothing parsed is stored.** Inspection of a processed material's Firestore document and its Storage prefix shows the original, optionally a converted PDF, and one cover image. No extracted text, no chunk records, no vectors.
