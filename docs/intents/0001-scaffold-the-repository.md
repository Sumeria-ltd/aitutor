---
id: 0001
status: approved
owner: aitutor-pm
inputs: [docs/prd.md]
updated: 2026-09-08
---

# Intent 0001 — Scaffold the repository

Derived from PRD requirement 0001, rank 1.

PROBLEM:  This repository contains documents and no project. Every requirement after this
          one needs somewhere to be built, a way to be run, and a way to be proven. Without
          that, the first person to implement anything spends their time inventing a layout,
          a test command and a run command — and invents them differently from whoever comes
          next. The cost is paid twice: once in the hours lost, and again every time someone
          cannot tell whether a change works, because there is no agreed way to ask.
          It also hides a harder failure. A project that only builds on the machine of the
          person who created it looks finished and is not transferable, and nobody discovers
          this until the second person arrives.

USER:     Whoever implements the next requirement — and, critically, someone who has never
          seen this project before, sitting at their own machine with nothing but the
          repository and its written instructions.

OUTCOME:  The repository holds a working project that a stranger can install, test and start
          from written instructions alone. There is one agreed way to run the tests and one
          agreed way to start the product, both written down, both working from a clean
          clone. From here on, "does this change work?" is a question with a mechanical
          answer, and every later requirement lands in a structure that already exists
          rather than one it has to invent.

SUCCESS:  Within one week, two people who have never built this project each follow the
          written instructions on their own machine. Count the steps either of them had to
          work out for themselves: zero. Count the ones who reach a passing test run and a
          running product: both.

LIMITS:   The instructions must be complete enough that nothing lives only in one person's
          head or only on one person's machine. No credential, key or connection string may
          be committed; names of required settings are listed with no real values beside
          them. The test command must fail when something is genuinely broken — a suite that
          passes against a broken project is worse than no suite, because it is trusted.
          Choosing what this is built with is an architecture decision and does not belong
          to this intent.

NOT NOW:  Deployment to anywhere a stranger can reach it over the internet — that is the
          platform role's work, once there is something worth deploying. Continuous
          integration running the suite automatically on every change. Any application
          behaviour at all: no account, no course, no session, no page a learner would
          recognise. Monitoring, error reporting and cost alerting.

## Open questions
- This requirement delivers nothing a learner can see, which makes it a poor fit for a
  document about user-visible outcomes. Is it genuinely a requirement, or a constraint on
  0002? PRD open question 6 carries the decision; if it resolves the other way, this intent
  is withdrawn and its content moves into 0002.
- How much must exist for the suite to be meaningful? A test that only proves the test runner
  runs is theatre. The suite needs at least one real seam to exercise, and which seam that is
  depends on architecture decisions not yet made.
- A scaffold specification was written on 8 September 2026 and never committed; it is not in
  any commit and is lost. Is there anything in it worth reconstructing from memory, or does
  the architect start clean?
