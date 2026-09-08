---
id: 0003
status: ready-for-review
owner: aitutor-pm
inputs: [docs/prd.md]
updated: 2026-09-08
---

# Intent 0003 — Sign in again

Derived from PRD requirement 0003, rank 3.

PROBLEM:  By November a learner has a term of work inside AITutor: forty sessions, their own
          summaries, practice results, a readiness picture assembled over three months. That
          accumulation is the whole reason to keep using it — and it is exactly what makes
          losing access catastrophic in a way it never was in week one.
          The moments a learner needs to get back in are the worst possible moments to be
          blocked. A new phone. Exam week, at two in the morning. A borrowed library computer
          because their own laptop is dead. A credential chosen in September and never typed
          since, because their phone remembered it for them. Being locked out here does not
          merely irritate; it destroys the thing the product spent a semester building. A
          learner who cannot reach their own material the week they need it most does not come
          back next term.

USER:     A returning learner — on a new device, after a long gap, or under exam-week time
          pressure.

OUTCOME:  The learner gets back to their material reliably, from any device, without
          ceremony. Returning on the phone they always use is effectively instant and requires
          no thought. Returning on an unfamiliar device in a bad moment still takes a couple
          of minutes and needs nothing they left at home. Recovery is a first-class path
          rather than an afterthought, because what sits behind it is a term of irreplaceable
          work that exists nowhere else.

SUCCESS:  Within one week, two measurements. On a device already used once, count the
          credentials a learner types to reach their material again, across ten opens: zero.
          And five people attempt recovery on a device they do not own, using only what is
          reachable from that device; count completions: five, each inside three minutes.

LIMITS:   No learner may lose a term's work to a forgotten credential. Recovery must always
          exist and must not depend on anything they cannot reach from a library computer.
          Staying signed in on a personal device is the normal case — repeatedly
          re-authenticating a learner on their own phone teaches them to stop opening it.
          Access must be reachable from a device the learner does not own and will never use
          again. Only the account holder reaches the material; recovery must not become a way
          in for anyone else, because the privacy promise is only as strong as this path.
          Signing in must not stand between a learner and the moment of capture any more than
          strictly necessary.

NOT NOW:  Institutional single sign-on. Device management, session listings, or remote
          sign-out. Shared or delegated access to another learner's account. Mandatory
          two-factor authentication, or anything requiring a second physical device.

## Open questions
- Recovery must not depend on anything left at home, and must not become a second door. Those
  two pull against each other, and the resolution is the whole design of this requirement.
- Is this genuinely rank 3? A learner cannot return before they have something to return to,
  which argues for placing it after 0004 and 0005. PRD open question 5 carries it.
- What happens to a learner who loses access to whatever recovery depends on? There is a
  point past which their term of work is unreachable, and where that point sits is a product
  decision, not a technical one.
