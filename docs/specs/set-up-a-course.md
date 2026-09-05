# Spec: Set up a course

Satisfies [`docs/intent/set-up-a-course.md`](../intent/set-up-a-course.md).

> Builds on [`register-an-account.md`](./register-an-account.md) and [`sign-in-again.md`](./sign-in-again.md). Amends neither.
>
> **Resolves two decisions left open by the architecture document:** the frontend router and server-state library (STACK), and the model tier for transcription-class work (STACK).

---

## APPROACH

**Shape chosen.** A course is a document under the student's own subtree, `students/{uid}/courses/{courseId}`. Objectives are a **subcollection** of that course, not an array field on it.

Three decisions carry this spec.

**1. Hierarchy is the authorization mechanism.** Every course, and everything under it, lives beneath `students/{uid}`. A query that would cross students is not "forbidden" — it is unwriteable, because the path does not exist. This makes the intent's "a course belongs to one student" a structural property rather than a rule someone has to remember to check, and it collapses the deletion cascade in `register-an-account` to a single recursive delete of one prefix.

**2. Objectives are a subcollection because they are referenced, not just displayed.** An array field would be simpler to read, and the counts are small (3–10). But `see-my-readiness` links evidence to individual objectives, and `capture-a-session` lets a student attach a session to one. Both need a stable id per objective that survives reordering and rewording. Array elements would need synthetic ids anyway, and would then have to be updated by read-modify-write — which loses a concurrent edit from a second tab. A subcollection gives each objective an id for free and makes edits independent.

**3. Extraction proposes; it never persists.** `POST /v1/courses/{courseId}/objectives:extract` reads the syllabus and returns candidate objectives **without writing anything**. Nothing exists until the student posts back the set they kept. This is the intent's "a draft they confirm, never a fact imposed on them" made literal: there is no state in which the product has decided what a student's objectives are. A dropped connection loses a cheap model call, not a decision.

Extraction is **synchronous**. A syllabus is a handful of pages and the student is sitting in front of the setup screen; deferring the work would put a spinner and a poll between them and the only visible payoff setup has.

A course is fully usable with **zero** objectives. Readiness is the only feature that requires them, and it says so rather than rendering an empty state that looks broken.

### Rejected alternatives

**Objectives as an array field on the course document.** Rejected — reasoning above. One read saved, at the cost of synthetic ids, lost concurrent edits, and a rewrite of `see-my-readiness` when evidence needs to point at something stable.

**A top-level `courses/{courseId}` collection with an `ownerUid` field.** Rejected. It makes cross-student access a *filter* rather than an *impossibility*, and every query everywhere has to remember the filter. It also turns the deletion cascade from one recursive prefix delete into a fan-out query per collection.

**Extraction as a deferred Cloud Tasks job.** Rejected here, though it is the right shape for `capture-a-session`. The distinguishing question is whether a human is waiting: they are. A 4-page syllabus is a few seconds of Flash-Lite, comfortably inside the Cloud Run request timeout, and the synchronous version has no job record, no polling endpoint, and no partial state to reconcile.

**Persisting extracted objectives as `status: "draft"` and letting the student confirm them in place.** Rejected, and this was the closest call. It survives a dropped connection and gives the client something to reload. But it creates a window in which the database holds objectives the student never agreed to, and every downstream reader — readiness especially — then has to remember to filter on status. One forgotten filter and the product is measuring a student against goals a PDF asserted on their behalf. The invariant is cheaper to keep if the state simply never exists.

**Letting the model name the course, guess the term, or infer a course code.** Rejected. Transcribing objectives out of a document the student supplied is transcription. Deciding what the course *is* is not, and the student types it in seconds.

**A shared catalogue of known courses, or templates per subject.** Rejected — the intent puts both in NOT NOW, and either would introduce a second, non-student-owned source of truth for what a course expects.

**Requiring objectives before a course can be created.** Rejected. It would raise the share of courses that have objectives — the number the intent says matters most — by blocking the students who would otherwise have adopted the product mid-semester with a syllabus they cannot find.

---

## INTERFACE

All routes are under `/v1`, all require `Authorization: Bearer <Firebase ID token>` via `requireAuth()`, and all operate implicitly on the calling student's subtree. **No route accepts a uid.**

### Routes

```
POST /v1/courses
  Body:     { title: string (1..120), code?: string (0..24), term?: string (0..40) }
  201:      Course
  400:      { error: "invalid_body", fields: string[] }
  409:      { error: "course_limit_reached" }        — 40 courses per student

GET /v1/courses
  200:      { courses: CourseSummary[] }             — ordered by createdAt desc

GET /v1/courses/{courseId}
  200:      Course
  404:      { error: "not_found" }

PATCH /v1/courses/{courseId}
  Body:     { title?, code?, term?, archived?: boolean }
  200:      Course

DELETE /v1/courses/{courseId}
  Auth:     required, with { checkRevoked: true }
  202:      { status: "accepted" }
  Recursive delete of the course subtree and its Storage prefix, via Cloud Tasks.

POST /v1/courses/{courseId}/uploads
  Body:     { filename: string, contentType: string, sizeBytes: number, purpose: "syllabus" }
  201:      { uploadId, uploadUrl, gsUri, expiresAt }
  400:      { error: "unsupported_type" | "too_large" }
  Issues a V4 signed PUT URL. The client uploads directly to Cloud Storage;
  no file bytes ever pass through the API. See UPLOAD PROTOCOL below.

POST /v1/courses/{courseId}/objectives:extract
  Body:     { uploadId: string }
  200:      { candidates: ObjectiveCandidate[], sourcePages: number[] }
  409:      { error: "upload_incomplete" }
  422:      { error: "no_objectives_found" }
  Reads the uploaded document and returns candidates. WRITES NOTHING.

POST /v1/courses/{courseId}/objectives
  Body:     { objectives: { text: string (1..300) }[] }   — max 24
  201:      { objectives: Objective[] }
  Replaces nothing; appends. Order of the array becomes `position`.

PATCH /v1/courses/{courseId}/objectives/{objectiveId}
  Body:     { text?: string (1..300), position?: number }
  200:      Objective

DELETE /v1/courses/{courseId}/objectives/{objectiveId}
  204:      —
```

### Shared types

```ts
// packages/shared/src/course.ts
export interface Course {
  id: string
  title: string
  code: string | null
  term: string | null
  archived: boolean
  objectiveCount: number      // denormalised; maintained on objective writes
  sessionCount: number        // maintained by capture-a-session
  createdAt: string           // ISO-8601
  updatedAt: string
  schemaVersion: number
}

export type CourseSummary = Pick<
  Course, "id" | "title" | "code" | "term" | "archived" |
          "objectiveCount" | "sessionCount" | "updatedAt"
>

export interface Objective {
  id: string
  text: string
  position: number            // 0-based, dense within a course
  origin: "extracted" | "written"
  createdAt: string
  updatedAt: string
}

export interface ObjectiveCandidate {
  text: string
  sourcePage: number | null   // page of the syllabus it was read from
}
```

`origin` records *how the wording arrived*, never whether it is authoritative. An extracted objective the student edited stays `"extracted"`; the field exists so the intent's "most created courses end up with objectives attached" can be split by path when deciding where setup is failing.

### Events

Extends the enums in [`register-an-account.md`](./register-an-account.md):

```ts
export type AuthedEventType =
  | ...                                  // existing
  | "course_created"                     // meta: { courseId }
  | "syllabus_uploaded"                  // meta: { courseId, pages }
  | "objectives_extracted"               // meta: { courseId, candidateCount, ms }
  | "objectives_confirmed"               // meta: { courseId, kept, edited, added, origin }
  | "course_setup_abandoned"             // meta: { courseId, lastStep }
```

`objectives_confirmed.meta` separates `kept` (accepted as extracted), `edited` (accepted with different wording) and `added` (typed from scratch). The intent's most important number — courses that end up with objectives — is answerable from `course_created` and `objectives_confirmed` alone; the breakdown says which path to fix when it is low.

### Client functions

```ts
// apps/web/src/courses/api.ts
listCourses(): Promise<CourseSummary[]>
getCourse(courseId: string): Promise<Course>
createCourse(input: { title: string; code?: string; term?: string }): Promise<Course>
updateCourse(courseId: string, patch: Partial<Pick<Course, "title"|"code"|"term"|"archived">>): Promise<Course>

uploadSyllabus(courseId: string, file: File): Promise<{ uploadId: string }>
extractObjectives(courseId: string, uploadId: string): Promise<ObjectiveCandidate[]>
saveObjectives(courseId: string, objectives: { text: string }[]): Promise<Objective[]>
```

### UPLOAD PROTOCOL

**Established here; `capture-a-session` extends it and does not replace it.**

1. Client calls `POST /v1/courses/{courseId}/uploads` with filename, MIME type and byte size.
2. API validates type and size, allocates `uploadId`, writes an `uploads/{uploadId}` record with `status: "pending"`, and returns a **V4 signed PUT URL** valid for 15 minutes.
3. Client `PUT`s the bytes straight to Cloud Storage. **No file bytes traverse Cloud Run** — a 40 MB PDF through a request handler would be paid for twice and would bound upload size by the request timeout.
4. The consuming call (`objectives:extract` here) verifies the object exists and its recorded size matches before use, and flips `status` to `"stored"`. An upload that is never consumed stays `pending` and is swept after 24 hours.

Object path: `students/{uid}/courses/{courseId}/uploads/{uploadId}/{sanitisedFilename}`. The uid prefix is what makes `register-an-account`'s deletion cascade a single prefix delete.

Accepted for `purpose: "syllabus"`: `application/pdf` only, ≤ 20 MB, ≤ 100 pages. Anything else is a 400 with a message naming the limit. Wider type support arrives with `capture-a-session`, which is where photographs and slide decks belong.

### Extraction call

```ts
// apps/api/src/ai/extractObjectives.ts
extractObjectives(gsUri: string): Promise<{ candidates: ObjectiveCandidate[]; usage: Usage }>
```

A single structured Gemini call — `responseMimeType: "application/json"` with a `responseSchema` pinning `{ candidates: [{ text, sourcePage }] }`. The `gs://` URI is passed by reference; the file is never re-uploaded or base64-inlined.

The prompt instructs the model to **transcribe learning outcomes as written**, to return an empty array rather than invent objectives when the document has none, and to leave `sourcePage` null rather than guess. Extraction has **no citation-validation requirement** — it cites pages of one document the student just uploaded, not sessions — so it does not go through the action runner that [`ask-my-course.md`](./ask-my-course.md) establishes. It is the only model call in the product that does not.

---

## DATA LAYER

### Firestore

```
students/{uid}/courses/{courseId}
  title           string
  code            string | null
  term            string | null
  archived        boolean            // false
  objectiveCount  number             // denormalised
  sessionCount    number             // 0 here; maintained by capture-a-session
  createdAt       Timestamp
  updatedAt       Timestamp
  schemaVersion   number             // 1

students/{uid}/courses/{courseId}/objectives/{objectiveId}
  text            string             // 1..300
  position        number             // 0-based, dense
  origin          string             // "extracted" | "written"
  createdAt       Timestamp
  updatedAt       Timestamp

students/{uid}/uploads/{uploadId}
  courseId        string
  purpose         string             // "syllabus"
  filename        string
  contentType     string
  sizeBytes       number
  gsUri           string
  status          string             // "pending" | "stored" | "swept"
  createdAt       Timestamp
```

`objectiveCount` is maintained in the same transaction as the objective write. It exists so the course list renders from one query instead of N+1, and so "how many courses have objectives" is a single `where("objectiveCount", ">", 0)` rather than a per-course fan-out.

### Cloud Storage

Bucket layout: `students/{uid}/courses/{courseId}/uploads/{uploadId}/{filename}`. Uniform bucket-level access, no public objects, no object ACLs. The API's service account is the only identity that signs URLs.

### Firestore security rules

**Unchanged — deny-all stands.** Nothing here needs client Firestore access; the hierarchical layout is an authorization *convenience* for server code, not a substitute for the deny-all posture established in `register-an-account`.

### Deliberately not stored

- **Institution, faculty, instructor name, or any course identifier issued by a university.** `code` is free text the student typed for their own recognition. Storing anything that looks official would imply a verification the product does not perform and cannot.
- **A timetable, class schedule, meeting days, or room.** NOT NOW in the intent, and nothing in v1 reads a date except the session date a student chooses.
- **Any link between two students' courses**, even where titles match exactly. There is no course identity above the student.
- **The extracted candidate list.** It exists for the duration of one HTTP response. Persisting it would recreate the "objectives the student never agreed to" state this spec exists to avoid.
- **Syllabus text or a parsed representation of it.** The PDF stays in Cloud Storage; extraction reads it by reference. A second parsed copy would drift and would be a second thing deletion has to reach.
- **`lastOpenedAt` on a course.** The `events` stream answers usage questions; a write on every course open is cost and contention for nothing.

---

## STACK

Extends [`register-an-account.md`](./register-an-account.md). **Four additions, all pinned.**

| Component | Version | Why |
|---|---|---|
| `react-router` | **8.3.1** | Routing. **Resolves the open router decision.** |
| `@tanstack/react-query` | **5.102.8** | Server-state cache. **Resolves the open state decision.** |
| `@google/genai` | **2.20.0** | Gemini via Vertex AI |
| `@google-cloud/storage` | **7.x** | V4 signed URL generation only |

Unchanged: Node 24.x · TypeScript 7.0.2 · React 19.2.8 · Vite 8.2.2 · `firebase` 12.18.0 · `firebase-admin` 14.3.0 · `hono` 4.13.5 · npm workspaces.

**Router — `react-router` 8.3.1, in declarative SPA mode.** Not the framework/SSR mode: the frontend is a Firebase Hosting static bundle talking to a separate Cloud Run API, and adopting the framework mode would drag in a server runtime that the topology has no place for. The `react-router-dom` package (7.18.3) is the v6 compatibility re-export and is deliberately not used in a new build.

**Server state — `@tanstack/react-query`, and no global client-state library.** Nearly everything on screen is server state: courses, objectives, sessions, answers. Query owns the cache, request deduplication, and invalidation after a mutation. What remains — auth status, the shared-device flag, a wizard's in-progress step — is small, local, and already served by React context and `useState`. Redux or Zustand here would be a second cache to keep in sync with the first.

**Model — `gemini-3.5-flash-lite` for syllabus extraction.** This is transcription: read a document, return the lines that are already in it. Flash-Lite is the cheapest tier that reliably produces structured output, and the task has no reasoning content to lose. Model ids are pinned in one file, `apps/api/src/ai/models.ts`; no other module in the codebase writes a model id as a literal.

> **Cost note.** A 4-page syllabus is roughly 4 image-equivalent inputs plus a short structured response, once per course, at most a handful of times per student per term. It is not a meaningful line in the $1–2/month budget. Confirm current per-image and per-token rates against Google's official Vertex AI pricing page before relying on that.

**Vertex AI configuration:** region pinned to a single location shared with the Cloud Storage bucket (a `gs://` object must live in the same project as the request). Credentials are Cloud Run's service account via ADC — no API key exists.

---

## SCOPE

### Create

```
packages/shared/src/course.ts              Course, Objective, ObjectiveCandidate

apps/api/src/routes/courses.ts             POST/GET/PATCH/DELETE /v1/courses
apps/api/src/routes/objectives.ts          objectives + objectives:extract
apps/api/src/routes/uploads.ts             POST /v1/courses/{id}/uploads
apps/api/src/services/courses.ts           Firestore access, objectiveCount maintenance
apps/api/src/services/objectives.ts
apps/api/src/services/uploads.ts           signed URLs, upload records, sweeper
apps/api/src/storage.ts                    Cloud Storage client, path construction
apps/api/src/ai/client.ts                  @google/genai init against Vertex AI (ADC)
apps/api/src/ai/models.ts                  the ONLY place model ids are named
apps/api/src/ai/extractObjectives.ts

apps/web/src/router.tsx                    react-router route tree
apps/web/src/queryClient.ts                react-query client + defaults
apps/web/src/courses/api.ts
apps/web/src/courses/hooks.ts              useCourses / useCourse / useCreateCourse …
apps/web/src/routes/Courses.tsx            all-courses list
apps/web/src/routes/CourseNew.tsx          name and term
apps/web/src/routes/CourseObjectives.tsx   upload, review candidates, confirm
apps/web/src/routes/CourseHome.tsx         shell; sessions arrive with capture-a-session
```

### Change

```
packages/shared/src/events.ts              five new AuthedEventType values
apps/api/src/index.ts                      mount the new routers
apps/api/src/services/deletion.ts          cascade now recurses students/{uid} subtree
apps/web/src/main.tsx                      RouterProvider + QueryClientProvider
```

### Must not be touched

- **`docs/intent/**`** and **`CLAUDE.md`** — as established in `register-an-account`.
- **`firestore.rules`** — deny-all stands.
- **`apps/api/src/middleware/auth.ts`** — the `requireAuth` contract is settled by `sign-in-again`. This spec consumes it unchanged.
- **`apps/api/src/services/profiles.ts`** — no course data belongs on the profile.

### Established here, and binding on every later spec

The **`students/{uid}/…` hierarchy** for all student-owned data; the **upload protocol** (signed PUT, no bytes through Cloud Run, uid-prefixed object paths); **`apps/api/src/ai/models.ts` as the single place model ids are named**; and the **router and server-state libraries**. Later specs extend these; they do not restructure them.

---

## ACCEPTANCE

### One per SUCCESS signal in the intent

**1. "A student can go from nothing to a course with objectives in place in under five minutes."**
On a throttled connection (Fast 3G), a student starting from the courses list reaches a course with at least one confirmed objective in under five minutes, including one syllabus upload and one extraction. The path costs four API round trips: `POST /v1/courses`, `POST …/uploads`, `POST …/objectives:extract`, `POST …/objectives`. The elapsed time is computable per student as `objectives_confirmed.at − course_created.at`.

**2. "Most created courses end up with objectives attached rather than left empty."**
Every course creation emits `course_created` and every confirmation emits `objectives_confirmed`, both carrying `courseId`. The share of courses with objectives is a distinct-`courseId` ratio between the two event types over any window — and is separately checkable against the database as `count(objectiveCount > 0) ÷ count(courses)`. The two numbers must agree; if they diverge, the event stream is lying and the metric is not to be trusted.

**3. "Students create courses for several subjects, not one."**
Courses per student is a count under `students/{uid}/courses`. A student with five courses has five sibling documents and no cross-course document anywhere, so the count is exact rather than inferred.

**4. "Courses created mid-semester are as likely to stay in use as courses created in week one."**
`course_created.at` is recorded for every course and never rewritten. Cohorting courses by creation week and comparing subsequent `session_created` activity (from `capture-a-session`) requires no additional field.

### Derived from LIMITS

**5. Extraction persists nothing.** Calling `POST …/objectives:extract` fifty times against one upload creates zero objective documents. `GET /v1/courses/{id}` after any number of extractions and no confirmation returns `objectiveCount: 0`.

**6. Extracted wording is editable and stays edited.** An objective confirmed with wording different from the candidate stores the student's text verbatim. A later extraction against the same syllabus does not alter, reorder, or re-suggest over it.

**7. A course with no objectives is fully usable.** A course created and never given objectives can be opened, renamed, and — once `capture-a-session` lands — have sessions and material added and be asked questions. Only readiness is unavailable, and it states why and links to adding objectives rather than rendering an empty chart.

**8. Extraction refuses rather than invents.** Given a PDF containing no learning outcomes (a past exam paper, a blank document, a reading list), extraction returns `422 no_objectives_found` and zero candidates. It does not synthesise plausible objectives for the subject.

**9. Courses cannot cross students.** With student A's valid token, every route in this spec addressed at a `courseId` belonging to student B returns `404 not_found` — not `403` — because the document is looked up beneath `students/{A}` and simply is not there. No route accepts a uid parameter that could make this a filter to forget.

**10. File bytes never pass through the API.** Uploading a 19 MB syllabus produces no Cloud Run request carrying the file body. The `PUT` goes to `storage.googleapis.com`, and Cloud Run's request logs show only the three small JSON calls.

**11. Nothing official is stored.** Inspection of a course document created through the full syllabus path shows exactly the ten fields in DATA LAYER. No institution, no instructor, no schedule, and no identifier that originated anywhere but the student's own typing.

**12. Deletion reaches everything.** After `DELETE /v1/courses/{courseId}`, no document remains under that course path and no object remains under its Storage prefix. Re-running the delete is safe and returns 202.
