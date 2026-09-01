# Spec: Sign in again

Satisfies [`docs/intent/sign-in-again.md`](../intent/sign-in-again.md).

> **This spec amended [`register-an-account.md`](./register-an-account.md).** Three changes, listed under AMENDMENTS below. **They have been applied** — the two specs agree.

---

## APPROACH

**Shape chosen.** Three paths, deliberately unequal in weight:

1. **Familiar device — a resumed session.** Firebase Auth persists a refresh token in `localStorage` indefinitely. The app opens already authenticated, silently refreshing the hourly ID token. This is the overwhelming majority of returns and involves no interaction at all.
2. **Unfamiliar device — Google, or an email link.** Both self-verify the address. Both work from a library computer with nothing but the student's memory of which email they used.
3. **Recovery — does not exist as a separate flow.**

That third point is the central decision. **There are no passwords, so there is nothing to recover.**

`register-an-account` specified email/password plus Google, with email verification requested but not enforced. Writing this spec exposed what that combination produces: a student who registered with a password and mistyped their email has an account with a credential they can forget and a reset address that reaches nobody. That is an unrecoverable account holding a term of irreplaceable work — the precise catastrophe this intent exists to prevent.

Removing passwords removes that state entirely. Google verifies the address by construction; an email link verifies it by delivery. Every surviving sign-in method proves control of the address as a side effect of being used, so **signing in and recovering are the same operation**. It also deletes an entire flow from the build: no reset UI, no password rules, no strength meter, no breach exposure.

A **"this is a shared computer"** toggle switches to `browserSessionPersistence`, so a library machine forgets the student when the browser closes.

### Rejected alternatives

**Keep email/password and fix recovery with a reset flow.** Rejected. A reset flow is only as strong as the address behind it, and `register-an-account` deliberately does not verify that address before use. Building reset would mean building a correct-looking path that silently fails for exactly the students who most need it. Deleting passwords is less code and strictly safer.

**Keep passwords, but block use until the email is verified.** Rejected. It reintroduces the drop-off that `register-an-account` rejected verification to avoid, trading a SUCCESS signal in one intent for one in another. Passwordless satisfies both.

**Keep passwords, and require verification once the account accumulates value** — after N days or the third session. Rejected, though it was close. Scaling recovery strength with what's at risk is sound in principle, but it means an interruption arriving at an arbitrary later moment, a threshold to tune, and *both* auth models to build and maintain. Passwordless gets the same guarantee with one model.

**One-time recovery codes issued at registration.** Rejected outright. The intent requires recovery that needs "nothing they left at home", and a recovery code is definitionally something left at home.

**Phone/SMS as a recovery channel.** Rejected in `register-an-account` and rejected again here, for the same reasons: per-message cost, a field the product declines to collect, and a semester pinned to a number students change between terms.

**A server-side session or device registry.** Rejected. It would let us list and revoke devices — which is exactly the device-management surface the intent puts in NOT NOW — and it duplicates state Firebase Auth already owns.

**Verifying the ID token with `checkRevoked: true` on every request** (as `register-an-account` specifies). Rejected on reflection. It forces a network round trip to Firebase on *every* API call, adding latency to every screen and cost to every request, to close a revocation window that is at most one token lifetime. Revocation checking belongs on destructive operations only. See AMENDMENTS.

---

## AMENDMENTS to `register-an-account.md`

Apply these three before implementing either spec.

**A1 — Authentication methods.** Replace "email/password and Google" with **"Google and email link (passwordless)"**. Firebase Auth providers: Google, and Email/Password with *Email link (passwordless sign-in)* enabled and password sign-in disabled. `registerWithEmail(email, password)` is removed from the client interface and replaced by `startEmailLinkSignIn(email)` / `completeEmailLinkSignIn()`. *One account per email address* remains enabled.

**A2 — Revocation checking.** `requireAuth()` becomes `requireAuth(opts?: { checkRevoked?: boolean })`, defaulting to `false`. `DELETE /v1/me` and any future route that changes auth state or destroys data must pass `{ checkRevoked: true }`.

**A3 — Event intake.** `POST /v1/events` takes **optional** authentication. With a valid Bearer token, `uid` is taken from the verified token and `AuthedEventType` values are accepted. Without one, only `PreAuthEventType` is accepted. A client-supplied `uid` in the body is still rejected in both cases.

---

## INTERFACE

### Client functions

```ts
// apps/web/src/auth/api.ts
signInWithGoogle(opts?: { sharedDevice?: boolean }): Promise<void>

startEmailLinkSignIn(email: string, opts?: { sharedDevice?: boolean }): Promise<void>
// Sends the link. Stores the address in localStorage under `emailForSignInLink`
// so same-device completion needs no retyping.

completeEmailLinkSignIn(href: string, email?: string): Promise<void>
// Completes from the link URL. `email` is required only when the link is opened
// on a different device than it was requested from — the cross-device case, where
// localStorage cannot carry the address.

signOut(): Promise<void>
// Clears Firebase persistence, `emailForSignInLink`, and the sharedDevice flag.
// Leaves `clientId` and `deviceId` intact — they identify the browser, not the student.

isEmailLinkSignIn(href: string): boolean
```

### Auth state

```ts
// apps/web/src/auth/AuthProvider.tsx
type AuthState =
  | { status: "loading" }                          // resolving persisted session
  | { status: "authenticated"; profile: Profile }
  | { status: "anonymous" }
  | { status: "error"; reason: "network" | "expired_link" | "invalid_link" }
```

On transition to `authenticated`, `AuthProvider` calls `ensureProfile()` (from `register-an-account`) and emits a `sign_in` event. Both happen on *every* authentication, resumed sessions included.

### Persistence selection

```ts
setPersistence(auth, sharedDevice ? browserSessionPersistence : browserLocalPersistence)
```
Called before any sign-in call. Default is `browserLocalPersistence`; a student must actively tick "this is a shared computer" to get the session-scoped variant.

### Events

Extends the enums established in `register-an-account`:

```ts
// packages/shared/src/events.ts
export type SignInMethod = "resumed" | "google" | "email_link"

export type AuthedEventType =
  | "registration_completed" | "profile_created"
  | "sign_in"                  // meta: { method: SignInMethod, isNewDevice: boolean }

export type PreAuthEventType =
  | "registration_started" | "registration_abandoned"
  | "sign_in_failed"           // meta: { method, reason }
  | "recovery_started"         // an email link was requested
  | "recovery_completed"       // that link was successfully used
```

`sign_in` is emitted for resumed sessions as well as fresh credentials, with `method: "resumed"`. Silent hourly ID-token refreshes emit nothing — they are not returns.

`isNewDevice` is true when this `deviceId` has not previously appeared in a `sign_in` event for this `uid`.

### Server

No new routes. `POST /v1/events` gains optional authentication per **A3**; `requireAuth` gains its parameter per **A2**.

---

## DATA LAYER

**No new collections.** Sign-in adds no server-side state beyond `events` documents, which are already specified.

### Client-side storage (`localStorage`)

| Key | Purpose | Cleared by |
|---|---|---|
| `aitutor.clientId` | uuid v4, browser identity for funnels | clearing site data |
| `aitutor.deviceId` | uuid v4, distinct-device counting | clearing site data |
| `aitutor.emailForSignInLink` | same-device email-link completion | `signOut()`, successful completion |
| `aitutor.sharedDevice` | persistence choice for this browser | `signOut()` |
| Firebase Auth keys | refresh token, managed by the SDK | `signOut()`, session end when shared |

On a shared device, Firebase's own keys go to `sessionStorage` instead, and are gone when the browser closes.

### Deliberately not stored

- **No server-side session or device registry.** Which devices a student uses is not recorded as state; it is derivable from `sign_in` events and nothing depends on it being authoritative. A registry would be the device-management surface the intent defers.
- **No sign-in IP addresses or geolocation.** Not needed to satisfy any signal here, and it would be the first genuinely sensitive thing the product collected.
- **No `lastSeenAt` on the profile.** It would mean a Firestore write on every app open — cost and write contention for something the `events` stream already answers.
- **No password material of any kind.** There are no passwords.
- **No failed-attempt counters per account.** Firebase Auth applies its own abuse throttling; a second counter would be a lock-out mechanism, and this intent exists to prevent lock-outs.

---

## STACK

**Unchanged from [`register-an-account.md`](./register-an-account.md). No new dependencies.**

Node 24.x · TypeScript 7.0.2 · React 19.2.8 · Vite 8.2.2 · `firebase` 12.18.0 · `firebase-admin` 14.3.0 · `hono` 4.13.5 · npm workspaces.

Everything in this spec uses `firebase/auth` APIs already present in 12.18.0: `signInWithRedirect`, `sendSignInLinkToEmail`, `signInWithEmailLink`, `isSignInWithEmailLink`, `setPersistence`, `browserLocalPersistence`, `browserSessionPersistence`.

**Firebase configuration changes** (console, not code): enable the Email/Password provider's *Email link* mode and **disable password sign-in**; add the Hosting domain to Authorized Domains; set the email-link action URL to the app's `/auth/complete` route.

**Google sign-in uses `signInWithRedirect`, not `signInWithPopup`.** Popups are blocked or broken on mobile Safari and in several in-app browsers, which is a substantial share of this product's traffic.

---

## SCOPE

### Create

```
apps/web/src/routes/SignIn.tsx            method choice, shared-device toggle
apps/web/src/routes/AuthComplete.tsx      handles the email-link return, incl. cross-device
apps/web/src/auth/persistence.ts          setPersistence selection
```

### Change

```
apps/web/src/auth/api.ts                  A1: remove registerWithEmail(email, password);
                                          add startEmailLinkSignIn / completeEmailLinkSignIn /
                                          signOut / isEmailLinkSignIn
apps/web/src/auth/AuthProvider.tsx        emit sign_in on every authentication, incl. resumed
apps/web/src/routes/Register.tsx          A1: drop the password field
apps/api/src/middleware/auth.ts           A2: requireAuth({ checkRevoked })
apps/api/src/routes/me.ts                 A2: DELETE passes { checkRevoked: true }
apps/api/src/routes/events.ts             A3: optional auth
packages/shared/src/events.ts             new event types and meta shapes
```

### Must not be touched

- **`docs/intent/**`** and **`CLAUDE.md`** — as established in `register-an-account`.
- **`firestore.rules`** — deny-all stands; nothing here needs client Firestore access.
- **`apps/api/src/services/profiles.ts`** — the profile shape is settled by `register-an-account`. Sign-in reads profiles; it does not extend them.

---

## ACCEPTANCE

### One per SUCCESS signal in the intent

**1. "Students return across a whole term, not only the fortnight after signing up."**
Every established authentication emits exactly one `sign_in` event carrying `method` — including sessions restored from persistence, which emit `method: "resumed"`. A silent hourly token refresh emits nothing. A weekly-returning-students count over any date range is therefore a distinct-`uid` count of `sign_in` events per week, with no inference required.

**2. "Signing in on a familiar device almost never requires the student to stop and think."**
Given a browser with a persisted session, when the app is opened, then it reaches `status: "authenticated"` with **zero** interactive steps and emits `sign_in` with `method: "resumed"`. Given that browser is left untouched for 30 days and reopened, it still resumes without interaction. The proportion of returns needing interaction is `1 − (resumed ÷ all sign_in)`.

**3. "Students who begin account recovery complete it."**
Requesting an email link emits `recovery_started` with the browser's `clientId`; successfully using that link emits `recovery_completed`. When the link is opened on a *different* device, `completeEmailLinkSignIn` prompts for the address, completes, and still emits `recovery_completed` with the *requesting* device's `clientId`, carried in the link's continue URL. Cross-device recovery is therefore not silently missing from the funnel.

**4. "Lock-outs do not cluster in exam weeks."**
Every failed authentication emits `sign_in_failed` with `method` and a `reason` drawn from a closed set (`expired_link`, `invalid_link`, `network`, `provider_error`). Combined with `recovery_started`, a per-ISO-week failure and recovery rate is computable without reading any student's content.

### Derived from LIMITS

**5. No credential can be forgotten.** No sign-in path in the shipped app accepts a password, and the Firebase Auth project has password sign-in disabled. Attempting `signInWithEmailAndPassword` against the project fails at the provider level, not merely in the UI.

**6. Recovery needs nothing left at home.** On a machine with no prior state — fresh browser profile, no extensions, no saved credentials — a student who knows only their email address reaches `authenticated` within two minutes, using only that machine and their webmail.

**7. Cross-device links work.** A link requested on a library desktop and opened on a phone completes successfully after the student re-enters their address. It does not fail with a missing-email error, which is the default Firebase behaviour when `localStorage` cannot supply it.

**8. A shared computer forgets.** With "this is a shared computer" ticked, Firebase Auth state is written to `sessionStorage` and not `localStorage`; after the browser is fully closed and reopened, the app is `anonymous`.

**9. Only the account holder gets in.** An email link is single-use and expires; replaying a consumed link yields `status: "error", reason: "expired_link"` and no session. A link requested for address A never grants access to the account for address B.

**10. Normal requests do not pay for revocation checks.** `GET /v1/me` performs local JWT verification with no outbound call to Firebase. `DELETE /v1/me` does perform the revocation check. This is observable as a latency difference and in outbound request logs.

**11. Signing out does not destroy browser identity.** After `signOut()`, `clientId` and `deviceId` survive; `emailForSignInLink`, `sharedDevice`, and all Firebase Auth state are gone. A subsequent sign-in on that browser is *not* counted as a new device.
