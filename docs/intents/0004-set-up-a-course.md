---
id: 0004
status: ready-for-review
owner: aitutor-pm
inputs: [docs/prd.md]
updated: 2026-09-08
---

# Intent 0004 — Set up a course

Derived from PRD requirement 0004, rank 4.

PROBLEM:  A learner is three weeks into a term carrying five courses, and none of them has a
          home. Slides sit in a downloads folder, notes are in a paper notebook, the syllabus
          was opened once and never again. Nothing in the learner's life holds the *shape* of
          a course — what it is supposed to teach them, and where they stand against that. So
          "am I behind in this course?" is a feeling they carry, never a fact they can check.
          The information that would make it a fact already exists. Course providers publish
          learning outcomes. Learners rarely read them and never track against them, so the
          one artifact that defines what a course expects goes unused all term.

USER:     A learner at the start of a term — or, more often, one picking up a course that is
          already weeks underway.

OUTCOME:  Every course the learner is taking has a named place that knows what the course is
          trying to teach. Objectives are declared once, up front, so that everything added
          later can be measured against something. Setup takes a couple of minutes rather than
          an evening, and starting mid-term feels normal rather than like arriving late to
          something already ruined.

SUCCESS:  Within one week of course setup existing, five learners each go from nothing to a
          course with at least one objective attached. Count those finishing inside five
          minutes: at least four. Count the courses left with zero objectives: at most one.

LIMITS:   Objectives belong to the learner and stay editable. Anything read out of a document
          they supply is a draft they confirm, never a fact imposed on them. Pulling objectives
          out of a document the learner already has is acceptable — it is transcription, and
          transcription is not the work that teaches; deciding what an objective *means* for
          them is work that must not be taken away. A course must be fully usable with no
          objectives at all: readiness stays unavailable until they exist, but capturing,
          asking and practising must never be blocked behind setup. A course belongs to one
          learner; there is no shared, official or verified course record to join.

NOT NOW:  Importing courses or enrolment from an institution's system. A shared catalogue or
          templates of known courses. Timetables, class schedules, or anything
          calendar-shaped. Any notion of a course being official, verified, or
          instructor-owned.

## Open questions
- What does this offer a learner who has no syllabus, or has one listing topics rather than
  outcomes? If most courses end up with no objectives or poor ones, 0009 degrades to an empty
  page and the learner never learns why. PRD open question 3 carries it, and it blocks whether
  0009 can be validated at all.
- Should a low-confidence extraction be shown? A bad draft makes the learner's first
  experience of the product's judgement a bad one, before anything has paid back. PRD open
  question 4.
- How coarse may an objective be before readiness stops meaning anything? "Understand
  thermodynamics" and "state the second law" are both objectives, and only one of them can
  usefully be measured against.
