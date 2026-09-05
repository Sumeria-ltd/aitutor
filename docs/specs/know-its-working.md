# Spec: Know it's working

Satisfies [`docs/intent/know-its-working.md`](../intent/know-its-working.md).

> Builds on every preceding spec — it consumes the `events` stream and the `usage/{yyyymm}` documents they emit, and adds no instrumentation to them. Amends none of them.
>
> **This is the last v1 spec.** After it, the six intents that describe student-facing behaviour and the three that describe account and operations are all specified.

---

## APPROACH

**Shape chosen.** A nightly rollup task reduces the `events` stream into a small set of dated metric documents, and a separate operator-only web surface reads those. Content is never read — not by the rollup, not by the dashboard, not by the operator — except through a consent-gated, time-boxed, logged support grant.

Five decisions carry this spec.

**1. The dashboard reads rollups, not raw events.** At tens to hundreds of students the raw stream is small enough to query directly, and that is exactly why the discipline matters now: a dashboard that queries raw events acquires ad-hoc queries, and ad-hoc queries over a collection that also contains `uid`s is how content and identity leak into an operator's habits. Rollups are aggregate by construction.

**2. No BigQuery, no export pipeline, no analytics vendor.** The cohort is small, the questions are known, and the intent scopes this to "an operator's instrument at small scale". A nightly Cloud Tasks job writing ~20 documents replaces an export, a warehouse, a scheduler and a second place student data lives. If the cohort outgrows it, that is a new spec with a real reason.

**3. The two riskiest assumptions are first-class metrics, not derivable ones.** The intent names them: capture surviving past week three, and repeat use of summary checking. They are computed and stored as named fields — `captureSurvivalByWeek`, `summaryCheckRepeatRate` — rather than left as queries someone must remember to write correctly. A number the product bets on should not depend on an operator reconstructing its definition.

**4. Content access requires the student's consent, per case, and is logged.** A support grant is a document the student creates from their own account settings, naming a course, with a 72-hour expiry. Every operator read under a grant writes an `accessLog` entry. Without a live grant, no operator route can return a question, an answer, a summary, or a material URL — enforced in code, not in policy.

**5. The operator surface is a separate bundle on a separate host.** `ops.<domain>`, its own Vite build, its own Firebase Hosting target, calling `/v1/ops/*` routes guarded by an `operator` custom claim. Keeping it out of the student bundle means operator code cannot be reached by reading the student app's JavaScript, and a student's token cannot call an ops route no matter what the client does.

**Behaviour, not engagement.** Every metric here measures an act that indicates learning — a session captured, a summary checked, a citation followed, a practice completed. There is no session-duration metric, no daily-active count, no time-in-app, and no retention curve for its own sake. The intent is explicit that optimising for time spent would work against what the product is for, so the number is not collected.

### Rejected alternatives

**Querying the `events` collection directly from the dashboard.** Rejected — reasoning above. The rollup is also what makes the privacy limit enforceable: the metric documents contain no `uid` at all, so an aggregate view cannot accidentally become an individual one.

**BigQuery export plus Looker Studio.** Rejected for v1. It is the right answer at a scale this product does not have, and it would put a second copy of every event — including `uid`s — in a system with its own access model to get right.

**A third-party product-analytics SDK in the client.** Rejected. It would ship student behaviour to a vendor the student never agreed to, which contradicts the privacy the product promises, and it would collect the engagement metrics decision 5 exists to avoid.

**Operator access to student content by default, with an audit log after the fact.** Rejected. An audit log is a deterrent, not a boundary. The intent says content access "requires that student's explicit consent for that case", and a grant the student creates is the only shape that matches.

**A permanent support-access role for the operator.** Rejected. Grants are per-case and expire; a standing role is the default access this spec exists to refuse.

**Storing question or summary text in `events` "for debugging".** Rejected, and it is the one that would quietly undo the privacy limit. Every event in every preceding spec carries ids, counts and timings by contract; this spec depends on that and does not relax it.

**Alerting on every failure.** Rejected. Individual material failures are expected (corrupt files, unsupported formats). Alerts fire on *rates* crossing thresholds, so that a real regression is distinguishable from the normal background.

**Instructor, institution, or student-facing reporting.** Rejected — NOT NOW in the intent, and it would give readiness and behaviour a reader the product promised they would not have.

---

## INTERFACE

### Operator authentication

A Firebase Auth custom claim, `role: "operator"`, set out of band with the Admin SDK by a one-off script that is not part of the deployed API. There is no route that grants the claim, no self-service, and no operator account creation flow — the intent puts staff roles and permissions in NOT NOW.

```ts
// apps/api/src/middleware/requireOperator.ts
requireOperator(): MiddlewareHandler
// requireAuth({ checkRevoked: true }) first, then asserts token.role === "operator".
// 404 — not 403 — on failure. An ops route does not confirm its own existence
// to a student's token.
```

Revocation checking is on for every ops route: operator access is the one thing in the product worth a round trip on every request.

### Routes

```
GET /v1/ops/health
  200: { api: "ok", firestore: "ok", vertex: "ok", converter: "ok",
         queueDepths: { materialProcessing, coverage, evidence } }

GET /v1/ops/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD
  200: { days: DailyMetrics[] }        — rollup documents; no uid anywhere

GET /v1/ops/cohorts?weeks=12
  200: { cohorts: CohortMetrics[] }    — the two riskiest assumptions

GET /v1/ops/failures?from=&to=
  200: { materialFailures: Bucketed[], citationViolations: Bucketed[],
         actionFailures: Bucketed[] }  — counts by reason, no ids, no content

GET /v1/ops/cost?month=YYYY-MM
  200: { totalCostMicros, studentCount, medianCostMicros, p95CostMicros,
         outliers: { anonId: string, costMicros: number, actionCounts: {} }[] }
  `anonId` is an HMAC of the uid under a server-held key — stable enough to
  investigate one student across a month, never reversible to an account by
  reading the dashboard.

POST /v1/ops/cost/{anonId}:resolve
  200: { uid: string }
  Resolves an outlier to a real uid. Logged to accessLog as an identity access.
  This is the only route that turns an anonId back into an account.

GET /v1/ops/students/{uid}/timeline?grantId=
  200: { events: OperatorEvent[] }     — types, timestamps, ids, counts. NO content.
  403: { error: "no_grant" }

GET /v1/ops/students/{uid}/content?grantId=&kind=&id=
  200: the requested ask, summary, or material read URL
  403: { error: "no_grant" | "grant_expired" | "out_of_scope" }
  Every call writes an accessLog entry before returning.
```

### Student-facing consent routes

These live in the **student** app, because the grant is the student's to give and revoke.

```
POST /v1/me/support-grants
  Body: { courseId: string, reason: string (1..200) }
  201:  { grantId, expiresAt }         — 72 hours, non-renewable
GET  /v1/me/support-grants
  200:  { grants: SupportGrant[] }     — active and expired, with access counts
DELETE /v1/me/support-grants/{grantId}
  204:  —                              — revokes immediately
```

A student can see every grant they have ever given, how many times it was used, and when. Revocation is instant.

### Types

```ts
// packages/shared/src/ops.ts
export interface DailyMetrics {
  date: string                       // YYYY-MM-DD
  activeStudents: number             // distinct uids with any behavioural event
  coursesCreated: number
  coursesWithObjectives: number
  sessionsCaptured: number
  medianDaysAfterHeldOn: number      // capture latency — the intent's first signal
  summariesWritten: number
  summariesChecked: number
  summariesRevised: number
  asksSubmitted: number
  asksUncovered: number
  citationsFollowed: number
  practicesStarted: number
  practicesCompleted: number
  readinessViews: number
  readinessActed: number
  materialFailureRate: number
  citationViolationRate: number      // violations ÷ actions requiring citations
  costMicros: number
}

export interface CohortMetrics {
  cohortWeek: string                 // ISO week a course was created
  courseCount: number
  captureSurvivalByWeek: number[]    // share still capturing in week 1,2,3…
  summaryCheckRepeatRate: number     // students with ≥2 checks ÷ students with ≥1
}

export interface SupportGrant {
  id: string
  courseId: string
  reason: string                     // the student's words, shown back to them
  createdAt: string
  expiresAt: string
  revokedAt: string | null
  accessCount: number
}
```

`DailyMetrics` carries **no uid, no course id, no session id, and no text**. It is a row of counts per day, and that is the whole of what the aggregate dashboard can display.

### The rollup

```ts
// apps/api/src/tasks/rollupMetrics.ts
rollupMetrics(date: string): Promise<void>
// Reads events for one UTC day, computes DailyMetrics, writes metrics/{date}.
// Idempotent: rewrites the document rather than incrementing.
// Weekly, additionally recomputes CohortMetrics for the last 16 weeks.
```

Scheduled by Cloud Scheduler at 02:00 UTC. A missed night is repaired by re-running for that date; because the task is a rewrite rather than an increment, replaying it is safe.

**`captureSurvivalByWeek`** is computed as: for courses created in cohort week *W*, the share that emitted at least one `session_created` in each subsequent week. Week three is the number the intent says decides whether the product works, so it is a stored array element rather than a query someone writes ad hoc.

**`summaryCheckRepeatRate`** is: students with ≥2 `summary_checked` events divided by students with ≥1, over the trailing 28 days.

### Alerting

Log-based metrics in Cloud Monitoring, with alert policies:

| Condition | Threshold |
|---|---|
| citation violation rate | > 2 % of citation-bearing actions over 1 hour |
| material failure rate | > 10 % over 1 hour |
| action failure rate (`action_failed`) | > 5 % over 15 minutes |
| queue depth, `material-processing` | > 100 for 15 minutes |
| daily cost | > 150 % of the trailing 7-day mean |
| rollup did not run | no `metrics/{yesterday}` document by 04:00 UTC |

The citation-violation policy is the important one: it is the health check for the retrieval thesis, and a rise in it means answers are being refused — or worse, that the invariant is doing work nobody noticed it needed to do.

---

## DATA LAYER

```
metrics/{YYYY-MM-DD}                  // top-level. NO uid, NO content.
  …DailyMetrics fields
  computedAt      Timestamp

metricsCohorts/{YYYY-Www}
  …CohortMetrics fields
  computedAt      Timestamp

students/{uid}/supportGrants/{grantId}
  courseId        string
  reason          string              // the student's words
  createdAt       Timestamp
  expiresAt       Timestamp           // createdAt + 72h
  revokedAt       Timestamp | null
  accessCount     number

accessLog/{autoId}                    // top-level, append-only, never deleted by a cascade
  operatorUid     string
  studentUid      string
  grantId         string | null       // null only for anonId identity resolution
  kind            string              // "timeline" | "ask" | "summary" | "material" | "identity"
  resourceId      string | null
  at              Timestamp
```

`accessLog` is deliberately **outside** `students/{uid}`, so `DELETE /v1/me`'s recursive cascade does not erase the record that an operator looked at something. It holds ids and timestamps, never content. This is the one collection in the product that survives account deletion, and it survives it on purpose.

### Deliberately not stored

- **No content in `metrics` or `metricsCohorts`.** No question, answer, summary, objective, course title, or filename. The aggregate surface is structurally incapable of showing content.
- **No uid in metric documents.** Individual behaviour is reachable only through the grant-gated timeline route.
- **No session-duration, time-in-app, daily-active-user, or engagement metric.** Not collected, per the intent's fourth limit.
- **No student-identifying field in the cost dashboard.** `anonId` is an HMAC under a server-held key; resolving one to a uid is a separate, logged action.
- **No operator notes, tags, or CRM-shaped state on a student.** This is an instrument, not a support tool with a customer record.
- **No second copy of events in a warehouse or vendor system.**
- **No standing operator access to any student's content.**

---

## STACK

Extends [`see-my-readiness.md`](./see-my-readiness.md). **One addition, plus one new deploy target.**

| Component | Version | Where |
|---|---|---|
| `@google-cloud/scheduler` | **5.x** | provisioning the nightly rollup (IaC only) |

Unchanged otherwise: Node 24.x · TypeScript 7.0.2 · React 19.2.8 · Vite 8.2.2 · `react-router` 8.3.1 · `@tanstack/react-query` 5.102.8 · `hono` 4.13.5 · `firebase-admin` 14.3.0.

**No model call exists anywhere in this spec.** Observability reads what the product already recorded.

**Deploy targets**

| Target | Host | Auth |
|---|---|---|
| `apps/web` | `app.<domain>` | any authenticated student |
| `apps/ops` | `ops.<domain>` | `role: "operator"` claim, revocation-checked |
| `aitutor-api` | Cloud Run, public | per-route |
| `aitutor-convert` | Cloud Run, internal | IAM |

`apps/ops` is a second Vite build and a second Firebase Hosting site in `firebase.json`. It shares `packages/shared` and nothing else — no student component, route, or client function is imported into it, and no ops code is imported into `apps/web`.

**Charts** use the `dataviz` conventions: a single-hue sequential scale for rates over time, categorical colours only where series are genuinely unordered, and no chart that renders an individual student as a series.

**Cloud Scheduler:** one job, `rollup-metrics`, 02:00 UTC daily, targeting `POST /v1/internal/rollup` with an OIDC token — the same mechanism `capture-a-session` established for Cloud Tasks handlers.

---

## SCOPE

### Create

```
packages/shared/src/ops.ts                 DailyMetrics, CohortMetrics, SupportGrant

apps/api/src/middleware/requireOperator.ts
apps/api/src/routes/ops/metrics.ts
apps/api/src/routes/ops/cohorts.ts
apps/api/src/routes/ops/failures.ts
apps/api/src/routes/ops/cost.ts
apps/api/src/routes/ops/students.ts        timeline + grant-gated content
apps/api/src/routes/ops/health.ts
apps/api/src/routes/supportGrants.ts       student-facing grant create/list/revoke
apps/api/src/routes/internal/rollup.ts     Cloud Scheduler target
apps/api/src/services/metrics.ts
apps/api/src/services/supportGrants.ts     grant validation, expiry, accessLog writes
apps/api/src/services/anonId.ts            HMAC of uid under a server-held key
apps/api/src/tasks/rollupMetrics.ts

apps/ops/                                  second Vite app — its own build target
apps/ops/src/main.tsx
apps/ops/src/router.tsx
apps/ops/src/routes/Overview.tsx           the daily numbers
apps/ops/src/routes/Assumptions.tsx        capture survival, summary-check repeat
apps/ops/src/routes/Failures.tsx
apps/ops/src/routes/Cost.tsx
apps/ops/src/routes/Support.tsx            grant-gated, one student at a time

apps/web/src/routes/PrivacySupport.tsx     the student's view of their own grants
```

### Change

```
firebase.json                              second Hosting target for apps/ops
apps/api/src/index.ts                       mount ops and grant routers
apps/api/src/services/deletion.ts           cascade deletes supportGrants;
                                            explicitly does NOT touch accessLog
infra/                                      Cloud Scheduler job, alert policies,
                                            log-based metrics
```

### Must not be touched

- **`docs/intent/**`**, **`CLAUDE.md`**, **`problem.txt`** — as established.
- **`firestore.rules`** — deny-all stands; the ops app reads through the API like every other client.
- **Every `apps/api/src/ai/**` file** — observability adds no instrumentation to the model path. It consumes the events and usage records those specs already emit. If a metric needs data that is not emitted, the emitting spec is amended, not the AI code patched from here.
- **`apps/web/**`**, apart from the one route that shows a student their own grants. No operator concern appears in the student bundle.
- **The `events` payload contract.** Every preceding spec states that event meta carries ids, counts and timings and no content. This spec depends on that and must not relax it to make a metric easier.

---

## ACCEPTANCE

### One per SUCCESS signal in the intent

**1. "The product's riskiest assumptions get answered with real behaviour."**
`GET /v1/ops/cohorts` returns `captureSurvivalByWeek` per course-creation cohort and `summaryCheckRepeatRate` over the trailing 28 days, both as stored fields on `metricsCohorts` documents. Week-three capture survival is `captureSurvivalByWeek[2]` — a value read from a document, not a query an operator composes. Both are visible on one screen without filtering or joining.

**2. "Failures are noticed by the operator before a student reports them."**
Alert policies fire on the six conditions tabulated above. Given an injected run of material-processing failures exceeding 10 % over an hour, an alert fires without any student action. `GET /v1/ops/failures` then shows counts bucketed by reason, with no ids and no content.

**3. "A support question can be answered without asking the student to reproduce anything."**
Given a live grant, `GET /v1/ops/students/{uid}/timeline` returns that student's event history — types, timestamps, ids, counts — sufficient to see which material failed, which action errored, and when. Reconstructing what happened requires no message to the student.

**4. "Cost per student is known, and a student whose usage is running away is visible well before the bill arrives."**
`GET /v1/ops/cost?month=` returns median and p95 cost per student and an outlier list, computed from `students/{uid}/usage/{yyyymm}` documents that every action increments. A student at 10× the median is visible on the day it happens, not at month end.

### Derived from LIMITS

**5. The aggregate surface cannot show content.** Inspection of any `metrics/{date}` document shows only the counts in `DailyMetrics`. No field holds a uid, a course id, a title, a filename, or any text a student wrote. `GET /v1/ops/metrics` returns those documents unmodified.

**6. Content requires consent.** With no grant, `GET /v1/ops/students/{uid}/content` returns `403 no_grant` for every `kind`. With an expired or revoked grant it returns `403 grant_expired`. With a grant for course A, a request for content in course B returns `403 out_of_scope`.

**7. Every content access is recorded.** Each successful content read writes an `accessLog` entry naming the operator, the student, the grant and the resource, **before** the response is returned. The count is reflected in `accessCount` on the grant, which the student can see.

**8. The student controls the grant.** A student can create, list and revoke grants from their own account. Revocation takes effect on the next operator request with no cache to expire. Grants expire at 72 hours and cannot be renewed — a further case needs a further grant.

**9. Access records survive deletion.** After `DELETE /v1/me`, the student's `supportGrants` are gone and their `accessLog` entries remain, holding ids and timestamps only. Deleting an account does not erase the record that someone looked.

**10. Aggregate is the default.** Four of the five ops screens display only rollup data and take no uid. The one that takes a uid requires a grant for anything beyond the event timeline.

**11. Engagement is not measured.** No route, metric document, or event carries session duration, time in app, daily-active-user counts, or a retention curve. Adding one requires amending this spec and the intent it would contradict.

**12. Students never see it.** The ops bundle is a separate build on a separate host. No ops route, component, or client function is imported by `apps/web`, and a student's token receives `404` from every `/v1/ops/*` route — not `403`, which would confirm the route exists.

**13. Identity resolution is deliberate and logged.** The cost dashboard shows `anonId` values. Turning one into a uid requires an explicit call to `POST /v1/ops/cost/{anonId}:resolve`, which writes an `accessLog` entry of kind `identity`. Browsing costs does not reveal who anyone is.

**14. The rollup is repairable.** Re-running `rollupMetrics` for a date already computed produces an identical document. A night missed entirely is recovered by re-running that date, and the missing-rollup alert fires if it is not.
