---
id: 0007
status: ready-for-review
owner: aitutor-pm
inputs: [docs/prd.md]
updated: 2026-09-08
---

# Intent 0007 — Ask my course

Derived from PRD requirement 0007, rank 7.

PROBLEM:  A learner has a question about their own course — what a term means, why one step
          follows another, what the instructor actually said about something. They have three
          options and all of them are bad.
          They can ask the group chat, and wait, and hope someone who also isn't sure answers.
          They can ask a general assistant, which replies instantly and confidently from the
          open internet, in notation their course does not use, at a depth their course does
          not require, with no way to tell whether it matches what they will be examined on.
          Or they can search their own files, opening them one at a time and reading until
          they find it. Only the last produces a trustworthy answer, and it is by far the
          slowest. So learners take the fast untrustworthy one, and carry an understanding they
          cannot check against the course that will grade them.

USER:     A learner mid-assignment or revising, who has a specific question and already
          possesses the material that answers it.

OUTCOME:  The learner asks a question and gets an answer built from their own course material,
          pointing at the session it came from. The answer is checkable — they can open the
          source and read it themselves. When their material does not answer the question, they
          are told so plainly instead of handed a plausible guess.
          Two things change. The answer arrives in their course's language and notation rather
          than the internet's. And the attribution turns the answer from something to be
          trusted into something to be verified — which sends the learner back into their own
          source material, which is where the learning actually happens.

SUCCESS:  Within one week of this existing, twenty questions are asked against a scope the
          learner chose. Count the answers naming a session outside that scope: zero. Count the
          answers shown with no session attributable at all: zero. Count the questions the
          material does not cover where the answer says so plainly and names what appears
          missing: all of them. The first number is the one that cannot be rounded.

LIMITS:   Answers are built from the learner's own material — never from general knowledge,
          and never quietly blended with it. Every answer must be attributable to a session; an
          answer that cannot be traced back does not get shown at all. "Your material doesn't
          cover this" is a correct and expected outcome, not a failure, and it should say what
          appears to be missing. The learner decides what a question is asked against: scope is
          theirs to set, not ours to infer silently. Answering must not substitute for
          studying — the answer points at the source, it does not stand in for reading it.

NOT NOW:  Questions spanning several courses at once. Drawing on textbooks, the web, or any
          source the learner has not added themselves. Working assignments end-to-end on the
          learner's behalf. Memory carried across separate conversations.

## Open questions
- A wrong attribution is worse than no answer, because it teaches the learner to stop checking.
  What does the learner see when an answer has to be withheld for that reason — and how often
  can that happen before the feature feels broken?
- Scope is the learner's to set, but a learner who does not know where the answer lives cannot
  set it well. What is offered to someone who genuinely does not know which session to ask
  against, without inferring it for them?
- How is "the learner followed the citation" distinguished from "the learner clicked it and
  closed it"? The behaviour this requirement is trying to cause is reading the source, and the
  obvious measure does not capture that.
