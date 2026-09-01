# Spec: Register an account

Satisfies [`docs/intent/register-an-account.md`](../intent/register-an-account.md).

---

## APPROACH

**Shape chosen.** Firebase Auth owns identity and credentials entirely. The Cloud Run API owns the student profile. The client authenticates against Firebase Auth directly, receives an ID token, and calls a single **idempotent bootstrap endpoint** (`POST /v1/me`) that creates the profile if it does not exist and returns it either way.

The bootstrap is called after *every* successful authentication, not only after registration. This is the load-bearing decision in this spec: it removes the entire class of bugs where an auth user exists with no profile behind it (network dropped mid-signup, app closed, a field added to the profile shape months later). There is no separate "registration finished" state to get wrong — the profile converges on every sign-in.

Registration offers **Google** and **email link (passwordless)**. There is no password anywhere in the product.

Both methods prove control of the email address as a side effect of being used, so registration verifies the address without a separate verification step and without blocking anyone. Firebase Auth is configured with *one account per email address*, so a student who registered by email link and later taps Google is guided into linking rather than silently given a second, empty account.

See [`sign-in-again.md`](./sign-in-again.md) for why passwords were removed: a forgettable credential paired with an unverified address produces an account that cannot be recovered.

### Rejected alternatives

**Client writes directly to Firestore, guarded by security rules.** Rejected. It puts authorization logic in two places — rules and server code — and every later feature (citation scope validation, coverage computation, cost accounting) has to run server-side regardless. Two access paths means two chances to get authorization wrong, and the rules path is the one nobody tests. Firestore rules here instead **deny everything**; all access is server-mediated via the Admin SDK.

**A Firebase Auth blocking function or `onCreate` trigger to build the profile.** Rejected. It introduces Cloud Functions as a second runtime and deployment surface next to Cloud Run, for one small write. Trigger failures are also silent and awkward to retry, which would reintroduce exactly the orphaned-auth-user problem the idempotent bootstrap exists to eliminate.

**Custom authentication — own password hashing, own JWTs.** Rejected. It means owning credential security, reset flows, and breach exposure for zero benefit when Firebase Auth is already in the stack and already integrated with the hosting and rules model.

**Phone / SMS authentication.** Rejected despite being common in this market. It bills per message, it adds a field the intent explicitly says not to collect, and it pins a student's semester of work to a phone number they may change between terms — which is precisely the lock-out `sign-in-again` exists to prevent.

**A separate mandatory email-verification step before first use.** Rejected. It contradicts the sub-minute registration limit and is the single largest known drop-off in signup funnels. It is also unnecessary once passwords are gone: both surviving methods verify the address inherently, so no window exists in which an unverified address can strand an account.

**Email/password registration.** Rejected — reasoning in `sign-in-again.md`. A password is a credential a student can forget, and pairing it with an address the product never confirmed produces an unrecoverable account holding a term of irreplaceable work. Removing it eliminates that state and deletes the entire password-reset surface from the build.

**Storing the student's email address in Firestore alongside Firebase Auth.** Rejected. Two copies of the same PII drift apart, and deletion then has two places to honour instead of one. Email lives in Firebase Auth only, and is read from the verified token when needed.

**Next.js fullstack on Cloud Run.** Rejected. Firebase Hosting for the frontend and Cloud Run for the backend already implies an SPA against a separate API. Collapsing them into Next.js would discard Firebase Hosting's CDN and couple the UI's deploy cadence to the API's.

---

## INTERFACE

All API routes are versioned under `/v1`. Every route except `POST /v1/events` requires `Authorization: Bearer <Firebase ID token>`.

### Server middleware

```ts
// apps/api/src/middleware/auth.ts
type AuthedContext = { uid: string; emailVerified: boolean }

requireAuth(opts?: { checkRevoked?: boolean }): MiddlewareHandler
// Verifies the ID token with getAuth().verifyIdToken(token, opts.checkRevoked ?? false).
// Sets c.var.auth. 401 on any failure.
//
// checkRevoked defaults to FALSE, making verification a local JWT check against cached
// public keys with no outbound call to Firebase. Routes that destroy data or change auth
// state pass { checkRevoked: true } and accept the round trip. Paying for revocation
// checking on every request would put a network hop in front of every screen to close a
// window that is at most one token lifetime.
```

### Routes

```
POST /v1/me
  Auth:     required
  Body:     { displayName?: string (1..80), locale?: "en" | "ar" }
  201:      Profile   — profile was created by this call
  200:      Profile   — profile already existed; body ignored except on first create
  401:      { error: "unauthenticated" }
  Idempotent. Safe to call on every sign-in. Never overwrites an existing profile.

GET /v1/me
  Auth:     required
  200:      Profile
  404:      { error: "no_profile" }  — client must call POST /v1/me

PATCH /v1/me
  Auth:     required
  Body:     { displayName?: string (1..80), locale?: "en" | "ar" }
  200:      Profile
  400:      { error: "invalid_body", fields: string[] }

DELETE /v1/me
  Auth:     required, with { checkRevoked: true }
  Body:     { confirm: "DELETE" }
  202:      { status: "accepted", deletionId: string }
  400:      { error: "confirmation_required" }
  Cascade is asynchronous. The Firebase Auth user is revoked and deleted first,
  so access ends immediately even if downstream cleanup is still running.

POST /v1/events
  Auth:     OPTIONAL
  Body:     { clientId: string (uuid v4), type: EventType, at: string (ISO-8601), meta?: object }
  202:      {}
  400:      { error: "unknown_event_type" }
  429:      { error: "rate_limited" }
  With a valid Bearer token, uid is taken from the verified token and AuthedEventType
  values are accepted. Without one, only PreAuthEventType is accepted. A client-supplied
  uid in the body is rejected in both cases. Rate limited to 20 requests per clientId per
  minute and 200 per source IP per minute. Carries no PII by contract.
```

### Shared types

```ts
// packages/shared/src/profile.ts
export type Locale = "en" | "ar"

export interface Profile {
  uid: string
  displayName: string | null
  locale: Locale
  createdAt: string      // ISO-8601
  updatedAt: string      // ISO-8601
  schemaVersion: number
}

// packages/shared/src/events.ts
export type PreAuthEventType = "registration_started" | "registration_abandoned"
export type AuthedEventType  = "registration_completed" | "profile_created" | "sign_in"
export type EventType = PreAuthEventType | AuthedEventType
// Extended by sign-in-again.md with sign_in_failed, recovery_started, recovery_completed,
// and the SignInMethod meta carried on sign_in.
```

### Client functions

```ts
// apps/web/src/auth/api.ts
registerWithGoogle(): Promise<void>
startEmailLinkSignIn(email: string): Promise<void>              // sends the link
completeEmailLinkSignIn(href: string, email?: string): Promise<void>
ensureProfile(): Promise<Profile>   // POST /v1/me; called after every successful auth
getClientId(): string               // uuid v4, created once, persisted in localStorage
```

Registration and sign-in share these functions: a first-time student and a returning one
take an identical path, and `POST /v1/me` is what decides which they were. Full signatures,
including the shared-device variants, are in [`sign-in-again.md`](./sign-in-again.md).

`ensureProfile()` retries on network failure with exponential backoff (3 attempts, 300ms base). A student who authenticates but cannot reach the API sees a retry state, never a half-created account.

---

## DATA LAYER

### Firestore: `students/{uid}`

Document id **is** the Firebase Auth uid. There is no separate student id, so there is no mapping table to keep consistent.

```
displayName    string | null      // null until the student supplies one
locale         string             // "en" | "ar"; defaults from Accept-Language, editable
createdAt      Timestamp          // server timestamp, set once
updatedAt      Timestamp          // server timestamp
schemaVersion  number             // 1
```

### Firestore: `events/{autoId}`

```
clientId       string             // uuid v4 from the browser; joins pre- and post-auth
uid            string | null      // null for pre-authentication events
type           string             // EventType
at             Timestamp          // server timestamp, not client-supplied
deviceId       string | null      // stable per browser profile; see below
```

`deviceId` is a uuid v4 generated once per browser and stored in `localStorage`. It counts *distinct devices*, nothing more — it is not a fingerprint, is not derived from any hardware or browser characteristic, and is cleared when the student clears site data.

### Firestore security rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Total denial of client access is deliberate and is the enforcement point for the intent's "the account is the privacy boundary". The Admin SDK bypasses rules; every read and write therefore passes through a route that has verified an ID token.

### Deliberately not stored

- **Email address and phone number.** They live in Firebase Auth and nowhere else. One source of truth, one place that deletion has to reach, no drift between copies.
- **Passwords or any credential material.** These never touch our systems in any form.
- **University, faculty, year of study, or student ID.** Not needed, and storing them would imply a verification the product explicitly does not perform.
- **IP addresses**, beyond the ephemeral in-memory window used for rate limiting on `POST /v1/events`. Never written to Firestore.
- **Browser fingerprints or any device characteristic.** `deviceId` is a random value we generated, not something we measured.
- **Marketing consent, newsletter flags, referral source.** No such feature exists; a field with no consumer is a liability.

### Deletion cascade

`DELETE /v1/me` executes in this order, so that access ends before cleanup begins:

1. `getAuth().revokeRefreshTokens(uid)` — existing sessions fail on their next `verifyIdToken` call, because `checkRevoked` is on.
2. `getAuth().deleteUser(uid)` — email and phone are gone at this point.
3. Delete `students/{uid}`.
4. Delete all `events` documents where `uid == uid`.
5. Delete every Cloud Storage object under the `students/{uid}/` prefix.

Steps 3–5 run in a background task and are idempotent, so a partial failure is safely retried.

**Known gap, stated rather than hidden:** the intent's limit is *"a student must be able to leave, taking **or** deleting their material."* This spec delivers deletion in full. Export is deferred until `capture-a-session` and the AI specs define what there is to export; it must not be quietly dropped, and it needs its own spec.

---

## STACK

Exact versions. Do not substitute or upgrade without amending this spec.

| Component | Version | Notes |
|---|---|---|
| Node.js | **24.x** (Active LTS) | 22 is maintenance-only; 26 is not LTS until Oct 2026 |
| TypeScript | **7.0.2** | Native Go compiler |
| React | **19.2.8** | |
| Vite | **8.2.2** | Rolldown bundler |
| `firebase` (client SDK) | **12.18.0** | Auth only in this spec |
| `firebase-admin` (server SDK) | **14.3.0** | Requires Node 22+ |
| `hono` | **4.13.5** | API framework on Cloud Run |
| Package manager | **npm workspaces** | Built in; no additional tooling |

**Validation** uses Hono's built-in `hono/validator`. No separate schema library is introduced — the payloads in this spec are small enough not to justify a dependency.

**TypeScript 7.0 caveat:** 7.0 is a compiler rewrite released weeks ago. If ecosystem tooling friction appears, dropping to the 6.x line is an acceptable amendment — but it is an amendment to this file, made once, not a per-package decision.

**Managed services:** Firebase Auth (Google provider, plus Email/Password configured in *email-link mode with password sign-in disabled*; *one account per email address* enabled), Cloud Firestore (Native mode), Cloud Run (min instances 0), Firebase Hosting, Cloud Storage. Cloud Run's service account is the only credential; no service-account key file exists anywhere in the repo or the deploy pipeline.

---

## SCOPE

### Create

```
package.json                             npm workspaces root
tsconfig.base.json

packages/shared/src/profile.ts
packages/shared/src/events.ts
packages/shared/src/index.ts

apps/api/src/index.ts                    Hono app, route mounting
apps/api/src/middleware/auth.ts          requireAuth
apps/api/src/middleware/rateLimit.ts     in-memory limiter for /v1/events
apps/api/src/routes/me.ts                POST/GET/PATCH/DELETE /v1/me
apps/api/src/routes/events.ts            POST /v1/events
apps/api/src/services/profiles.ts        Firestore access for students/{uid}
apps/api/src/services/events.ts          Firestore access for events/{autoId}
apps/api/src/services/deletion.ts        cascade
apps/api/src/firebase.ts                 Admin SDK initialization (ADC)
apps/api/Dockerfile

apps/web/src/auth/firebase.ts            client SDK initialization
apps/web/src/auth/api.ts                 registerWithEmail / registerWithGoogle / ensureProfile
apps/web/src/auth/AuthProvider.tsx       auth state, calls ensureProfile on every sign-in
apps/web/src/routes/Register.tsx
apps/web/src/lib/clientId.ts             getClientId / getDeviceId

firestore.rules                          deny-all
firebase.json                            Hosting config and rules deployment
```

### Must not be touched

- **`docs/intent/**`** — intent files are the requirement, not an implementation artifact. If code cannot satisfy an intent, amend the intent deliberately and separately; never edit one to match what was built.
- **`CLAUDE.md`** — product invariants and architecture decisions. Amended only by explicit decision, never as a side effect of implementation.
- **`problem.txt`** — the original brief, kept as a historical record.

### Established here, and binding on every later spec

The workspace layout (`apps/web`, `apps/api`, `packages/shared`), the `/v1` route prefix, the `requireAuth` middleware contract, the deny-all Firestore rules posture, and the rule that **document ids for student-owned data are the Firebase Auth uid**. Later specs extend these; they do not restructure them.

---

## ACCEPTANCE

### One per SUCCESS signal in the intent

**1. "Most students who begin registration finish it."**
Given a browser with no prior state, when the registration screen renders, then a `registration_started` event exists carrying that `clientId` and no `uid`. When registration then completes, a `registration_completed` event exists with the *same* `clientId` and a `uid`. A completion-rate query over any date range returns a number without manual joining or reconciliation.

**2. "Students reach a first moment of value soon after registering."**
Given a completed registration, `students/{uid}.createdAt` is set exactly once and never rewritten by a later `POST /v1/me`. Time-to-first-value is therefore computable as the delta between `createdAt` and the student's first course-creation event. *(The course event itself belongs to `set-up-a-course`; this criterion asserts only that the baseline timestamp is stable and trustworthy.)*

**3. "Students sign in from more than one device across a term."**
Given the same account signing in from two browser profiles, two `sign_in` events exist for that `uid` with different `deviceId` values. Given the same account signing in twice from one browser, both events carry the *same* `deviceId`. A distinct-device count per uid is therefore a `COUNT(DISTINCT deviceId)`.

**4. "Few students register twice."**
Given an account already registered by email link, when the same person attempts Google sign-in with that same email address, then no second Firebase Auth user is created and no second `students/{uid}` document exists. The client receives an account-linking path, not a fresh empty account.

### Derived from LIMITS

**5. Sub-minute registration.** On a throttled connection (Fast 3G profile), the **Google** path from registration screen to an authenticated session with a profile completes within 60 seconds. The **email-link** path completes within 60 seconds of the student opening the link — time spent in their mail client is outside the product and outside this measurement. Neither path exceeds two API round trips (`POST /v1/events`, `POST /v1/me`).

**6. The bootstrap is genuinely idempotent.** Calling `POST /v1/me` fifty times for one uid yields exactly one `students/{uid}` document, an unchanged `createdAt`, `201` on the first call and `200` on the rest.

**7. Interrupted registration self-heals.** Given an auth user whose `POST /v1/me` failed and left no profile, when that student next signs in, `ensureProfile()` creates the profile and the account is fully usable. No orphaned auth user survives a subsequent sign-in.

**8. The privacy boundary holds.** A client SDK read of `students/{uid}` — using that student's *own* valid credentials — is denied by security rules. Every legitimate read passes through an authenticated API route.

**9. Nothing excluded is stored.** Inspection of a freshly created `students/{uid}` document shows exactly the six fields in DATA LAYER. No email, no phone, no institution, no IP address.

**10. Deletion revokes access first.** After `DELETE /v1/me` returns 202, the caller's existing ID token fails `verifyIdToken` with `checkRevoked` on, before the background cascade has necessarily finished.

**11. Unauthenticated event intake cannot be abused.** `POST /v1/events` rejects any `type` outside `PreAuthEventType` with 400, rejects a body containing a `uid` field, and returns 429 after 20 requests from one `clientId` inside a minute.
