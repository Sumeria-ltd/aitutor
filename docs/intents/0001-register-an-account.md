---
id: 0001
status: approved
owner: aitutor-pm
inputs: [docs/prd.md]
updated: 2026-09-08
---

# Intent 0001 — Register an account

Derived from PRD requirement 0001, rank 1.

PROBLEM:  A learner in the corridor after a lecture, holding a file they want to keep, meets
          a signup form. That is where most of them leave — not because registering is
          difficult, but because it arrives before the product has done anything for them.
          They came to solve a thirty-second problem and were asked to make a commitment
          first.
          But the account is not bureaucracy, and treating it as a formality misses what it
          carries. Material has to survive a lost phone, a reinstalled app, a switch from
          laptop to phone mid-week. A term's accumulated work is only worth building if it is
          durable and genuinely theirs. And the promise that a course is private to one
          learner means nothing without an account to draw that boundary. So registration
          holds a real tension: it makes the product's central promises true, and it is
          simultaneously the largest point of abandonment, sitting at the worst possible
          moment.

USER:     A learner meeting AITutor for the first time — usually on a phone, usually with
          something specific they wanted to do right now.

OUTCOME:  The learner ends up with an account that makes their work durable, portable and
          private, reached with the least possible interruption to whatever they actually
          came to do. They understand what the account is *for* — this is where your material
          lives, and only you can see it — rather than only that one was demanded of them.
          Signing up feels like securing something, not paying a toll.

SUCCESS:  Within one week of registration existing, five people register on a phone while
          timed. Count those finishing inside 60 seconds: at least four. Then ask each one,
          cold and unprompted, what the account is for; count those who say the material is
          theirs and nobody else can see it: at least four.

LIMITS:   Completable on a phone, in a corridor, on a poor connection, in under a minute.
          The account is the privacy boundary, and what that means must be evident at the
          moment of signing up rather than buried where nobody reads it. Collect only what is
          needed to make access durable and recoverable — every additional field costs
          learners. No institutional affiliation is required and none is verified; nothing
          may imply a learner has been vouched for by their university. A learner must be
          able to leave, taking or deleting their material; ownership that cannot be
          exercised is not ownership.

NOT NOW:  Institutional single sign-on. Verifying that a learner genuinely attends a given
          university. Paid plans, trials, or anything requiring payment details. Invitations,
          referrals, or any social connection between learners. Any account type other than a
          single learner.

## Open questions
- How is a duplicate registration avoided? A learner who registers twice has their first
  term's material stranded and will not know why the product feels empty — but detecting a
  duplicate without asking for more information cuts against collecting less.
- Does the first moment of value come before or after the account? The problem above argues
  for letting a learner capture something and then securing it, but that shape means material
  exists briefly with no owner, which strains the privacy boundary.
- Export is named above as a limit, but its shape is unsettled. What does a learner receive
  when they take their material with them, and is that within 0001 or its own requirement?
