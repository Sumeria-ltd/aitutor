---
id: 0001
status: ready-for-review
owner: aitutor-architect
inputs: [docs/intents/0001-register-an-account.md, docs/prd.md, docs/adr/0003-one-typescript-monorepo.md, docs/adr/0004-one-test-runner.md, docs/adr/0006-isolation-per-learner.md, docs/adr/0008-measurement-event-shape.md, docs/adr/0009-make-contract-for-ci.md, docs/adr/0010-ci-triggers-on-push.md, docs/adr/0011-merge-blocking-is-a-committed-ruleset.md, CLAUDE.md]
updated: 2026-09-08
---

# Spec 0001 — Register an account, and stand up the repository

Implements intent 0001. Bound by ADR 0003, 0004, 0006, 0008, 0009, 0010, 0011.

APPROACH:   Two things ship as one vertical slice because PRD §7 binds them: the repository
            must be installable and testable by a stranger before anything ships into it, and
            registration is the first thing to ship. The scaffold is not a separate
            deliverable — it is the floor this one stands on.

            Registration is **passwordless**. The learner enters an email address, receives a
            sign-in link, and following it creates the account. There is no password to
            choose, to forget, or for us to store. This is one field, which is what makes the
            under-a-minute bar reachable on a phone, and it makes recovery identical to
            signing in — which is the whole of intent 0002's "no learner may lose a term's
            work to a forgotten credential", solved once here rather than retrofitted later.

            Rejected: email and password (a credential chosen in September and never typed
            again is precisely the failure intent 0002 names; it also adds a second field and
            a reset flow that is a worse version of the link flow we would already have).
            Rejected: federated sign-in with a third-party identity provider (fewer taps, but
            it introduces a provider the learner may not have, leaks the existence of the
            account to that provider, and edges toward implying an affiliation that intent
            0001's LIMITS forbid the product from implying).
            Rejected: a third `make` target for the document checks (ADR 0009 says the
            workflows invoke `make build` and `make test` and nothing else; the invariants
            become tests inside the suite instead, which keeps them and obeys the ADR).

INTERFACE:  Every route below except `POST /api/auth/session` requires a verified Firebase ID
            token in `Authorization: Bearer <token>`; the middleware resolves it to a learner
            id and every handler reads only records owned by that id (ADR 0006).

            `POST /api/auth/session`
              body    `{ idToken: string }`
              200     `{ learner: { id: string, email: string, createdAt: string } }`
              creates the learner record if absent; emits `account.registered` on first
              creation, `account.signed_in` otherwise
              401     token absent, malformed, expired or revoked

            `GET /api/me`
              200     `{ learner: { id, email, createdAt } }`

            `GET /api/me/export`
              200     `{ exportedAt: string, learner: {...}, courses: [], sessions: [],
                        materials: [], summaries: [] }`
              The four collections are present and empty. They are declared now so that every
              later requirement extends this payload rather than inventing an export.

            `DELETE /api/me`
              204     learner record deleted, owned records deleted, events anonymised (see
                      DATA), refresh tokens revoked so existing sessions cannot continue

            `packages/shared` exports, consumed by both surfaces:
              `type Learner = { id: string; email: string; createdAt: string }`
              `type EventName` — a union over the registry
              `EVENTS: readonly EventName[]` — the registry ADR 0008 requires
              `makeEvent(name, learner, requirement, attributes): AitutorEvent`
              `isScalarAttributes(value: unknown): boolean` — the ADR 0008 content guard

DATA:       Firestore, one database (CLAUDE.md).

              `learners/{learnerId}`   `{ email, createdAt }`
              `events/{eventId}`       `{ name, occurredAt, learner, requirement, attributes }`

            The learner id is the Firebase Auth uid, so the privacy boundary and the identity
            are the same key and cannot drift apart (ADR 0006).

            Events emitted by this requirement, and no others:
              `account.registration_started`  `{}`
              `account.registered`            `{ secondsToComplete: number }`
              `account.signed_in`             `{}`
              `account.exported`              `{}`
              `account.deleted`               `{}`

            **Deliberately not stored:** any password or password hash — there is none; the
            learner's name; any institution, course provider or affiliation; IP address; user
            agent; anything a learner typed other than the email address itself.

            **On deletion, events are anonymised rather than deleted.** The `learner` field is
            overwritten with a random token that is not recorded anywhere, so the events
            remain countable in aggregate and are no longer attributable to a person. Deleting
            them instead would destroy the cohort measurement requirement 0009 depends on;
            keeping them attributable would break the promise in intent 0001's LIMITS. This is
            the load-bearing judgement in this spec — see RISKS.

STACK:      Verified against the npm registry on 2026-09-08. Peer ranges checked; every
            optional peer left uninstalled.

              node                      24  (local v24.1.0; satisfies every engine below)
              typescript                7.0.2
              vite                      8.2.2
              @vitejs/plugin-react      6.1.1   peer vite ^8.0.0 — satisfied
              react / react-dom         19.2.8
              @types/react              19.2.18
              @types/react-dom          19.2.7
              @types/node               24.13.3 pinned to the runtime major, not latest (26.x)
              vitest                    5.0.0   peer vite ^6.4 || ^7 || ^8 — satisfied
              jsdom                     30.0.1  optional peer of vitest, needed by apps/web
              @testing-library/react    16.3.3  peer react ^18 || ^19 — satisfied
              @testing-library/dom      10.4.1  required peer of the above
              hono                      4.13.7
              @hono/node-server         2.1.1   peer hono ^4 — satisfied
              firebase                  12.18.0 web SDK, apps/web only
              firebase-admin            14.3.0  apps/api only; engine node >=22
              @biomejs/biome            2.5.12

SCOPE:      Create:
              package.json                          workspaces, and the scripts make calls
              tsconfig.base.json, biome.json, .gitignore, .env.example, .nvmrc
              vitest.config.ts                      root project covering all three workspaces
              packages/shared/{package.json,tsconfig.json,src/index.ts,src/learner.ts,
                               src/events.ts,src/events.test.ts}
              apps/api/{package.json,tsconfig.json,src/index.ts,src/auth.ts,src/routes/me.ts,
                        src/events.ts,src/firestore.ts,src/auth.test.ts,src/routes/me.test.ts}
              apps/web/{package.json,tsconfig.json,vite.config.ts,index.html,
                        src/main.tsx,src/App.tsx,src/firebase.ts,src/screens/SignIn.tsx,
                        src/screens/Finish.tsx,src/screens/Home.tsx,src/App.test.tsx}
              tests/docs-invariants.test.ts         runs scripts/check-docs.sh, asserts exit 0
              README.md                             the written instructions PRD §7 counts

            Modify:
              Makefile                              replace the bodies of `build` and `test`
                                                    only; the target names are load-bearing
                                                    (ADR 0009) and must not change

            Preserve untouched:
              .github/**, scripts/**, docs/**, CLAUDE.md, problem.txt

OUT:        No course, session, material, summary, question, practice or readiness behaviour —
            those are requirements 0002 through 0009. No model call of any kind; nothing in
            this requirement talks to Vertex AI. No deployment, no cloud project, no hosting
            configuration — that is the platform role, after this merges. No password, no
            reset flow, no federated provider. No profile, avatar or display name. No
            analytics or error-reporting vendor. No `docs/**` edits: if this spec is wrong,
            it comes back to the architect.

ACCEPT:     A1  From a clean clone, the README's instructions reach a passing `make test`
                with no step the reader must work out; verified by following the README on a
                machine with no project state.            -> PRD §7 scaffold constraint
            A2  `make build` and `make test` succeed, and `make test` runs the real suite —
                a deliberate break in `packages/shared` turns it red.
                                                          -> PRD §7 scaffold constraint
            A3  Starting the product takes no more than two commands, both in the README.
                                                          -> PRD §7 scaffold constraint
            A4  The suite crosses a real seam: a value defined in `packages/shared` is
                consumed by a test in `apps/api` and a test in `apps/web`, and changing it in
                `shared` fails both.                       -> ADR 0004
            A5  Registration requires exactly one learner-supplied field. A test asserts the
                sign-in form renders one input and no password field.
                                                          -> PRD acceptance 0001 (field count)
            A6  The sign-in screen renders the sentence stating the material is the learner's
                and private to them, before any credential is entered.
                                                          -> PRD acceptance 0001 (understood purpose)
            A7  `POST /api/auth/session` with a valid token creates a learner and emits
                `account.registered`; called again with the same identity it emits
                `account.signed_in` and creates nothing.   -> PRD acceptance 0001
            A8  `GET /api/me` with another learner's token never returns this learner's
                record; a test asserts 401 or an empty result, never a cross-read.  -> ADR 0006
            A9  `GET /api/me/export` returns the learner and the four declared collections.
                                                          -> PRD acceptance 0001 (export)
            A10 After `DELETE /api/me`: the learner record is gone, `GET /api/me` with the old
                token is 401, and every event that carried that learner id now carries a token
                that appears nowhere else.                 -> PRD acceptance 0001 (nothing remains)
            A11 `isScalarAttributes` rejects an event whose attributes contain a nested object,
                an array, or a string longer than the registry's limit; the emit path refuses
                it rather than writing it.                 -> ADR 0008
            A12 Every event name emitted by this requirement appears in the `EVENTS` registry,
                and a test fails if an emitted name is missing from it.  -> ADR 0008

RISKS:      The deletion-anonymises-events decision is the one to check first. It is a privacy
            claim made by this spec, not by the PRD, and it can be wrong in two directions: if
            the token is derivable from the learner id the promise is false, and if the events
            are too few or too specific a determined reader could still re-identify a learner
            from timing alone in a small cohort.

            `make test` becoming the real suite removes the document-invariant checks from
            their current position as the merge gate's whole content. If
            `tests/docs-invariants.test.ts` is written but not actually wired into the root
            vitest project, the gate silently stops checking documents and nothing goes red —
            the exact failure shape ADR 0009 warns about.

            The under-a-minute measure depends on email delivery latency, which this
            requirement does not control and cannot test. A slow provider fails the acceptance
            line without any defect in the code.

            `typescript` at 7.x is a major the surrounding tooling may not have caught up to.
            If `@biomejs/biome` or `vitest` mis-parse current syntax, drop to the latest 6.x
            and record it as an amendment rather than working around it.

## Unmapped acceptance lines

Two PRD acceptance rows for 0001 cannot be closed by this spec, and are not silently dropped:

- *"Five people register on a phone while timed; at least four finish inside 60 seconds."*
  A5 and A6 establish the preconditions — one field, no password, the promise stated — but
  the measure needs five people and a phone. It belongs to `aitutor-validator` after
  deployment, and cannot be met before then.
- *"Ask each of those five, unprompted, what the account is for; at least four say the
  material is theirs and private."* A6 asserts the sentence is rendered. Whether it is
  *understood* is not a property of the code, and no test can assert it.

Both are conformance items the validator must run with people, against the deployed URL. A
green suite does not close either one.
