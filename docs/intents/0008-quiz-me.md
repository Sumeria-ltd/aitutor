---
id: 0008
status: approved
owner: aitutor-pm
inputs: [docs/prd.md]
updated: 2026-09-08
---

# Intent 0008 — Quiz me

Derived from PRD requirement 0008, rank 8.

PROBLEM:  A learner wants to know whether they can produce what their course expects, before
          somebody else tests them on it.
          Self-testing is the most effective study technique there is, and almost nobody does
          it, because writing good questions about material you have not yet mastered is harder
          than studying the material. The ready-made alternatives fail differently: question
          banks, flashcard decks and generic practice sets test a generic version of the
          subject rather than the one this instructor taught — different notation, different
          emphasis, often a different depth than the course requires. A learner who scores well
          on those gets a confidence reading that does not correspond to the exam they will
          actually sit. So revision becomes rereading. The learner feels prepared, and finds
          out otherwise.

USER:     A learner preparing for an exam, a quiz, or simply the next class, who wants to know
          what they can genuinely recall and apply.

OUTCOME:  The learner gets practice questions drawn from their own sessions — their
          instructor's emphasis, their course's notation, the material actually covered. They
          can test one session before the next class, or a run of sessions before an exam.
          Afterwards they know which parts they hold and which they do not, specifically enough
          to do something about it before it is graded.

SUCCESS:  Within one week of this existing, practice is generated for five single sessions.
          For each set, show ten questions to someone who attended that course and count those
          they recognise as their own course rather than generic: at least eight of ten, in
          every set. Count the practice runs that end with something naming what to do next
          rather than only a score: all of them.

LIMITS:   Questions are drawn from the learner's material — never generic subject-matter
          questions dressed up as their course. Practice must be available for a single session
          as readily as for many; the five-minute check before Tuesday's lecture matters as
          much as the exam cram. Results tell the learner what to do next, not merely how they
          scored. Getting questions wrong must feel like information rather than judgment, for
          the same reason as 0006 — this is where honest self-assessment happens. Practice
          tests what was taught, not what the subject contains in general: something the course
          never covered is a coverage gap and belongs to 0009, not a question the learner
          should be marked wrong on.

NOT NOW:  Spaced repetition or scheduled review. Shared, exported, or importable question
          sets. Timed runs or exam-simulation modes. Questions spanning several courses at
          once.

## Open questions
- What does practice look like for a session that holds only an attached file and no account in
  the learner's own words? The material is there but the learner's understanding of it is not,
  and it is unclear whether that produces useful questions or merely answerable ones.
- "Recognisably their own course" is the stated bar and is judged by a person. Is there anything
  countable that correlates with it, or does this requirement stay qualitatively measured?
- A poor result should send the learner back to the material. Is that a link, a prompt, or
  nothing at all? Prompting edges toward the companion layer that v1 defers.
