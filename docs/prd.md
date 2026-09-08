---
id: prd
status: approved
owner: aitutor-pm
inputs: [problem.txt, CLAUDE.md, docs/PRD.md@116b918]
updated: 2026-09-08
---

# PRD — AITutor

## 0. About this document

**Reader:** the people building it. Dense on purpose. Its job is to stop scope being
re-litigated and to be the thing every intent and spec traces back to.

**Precedence.** This document is the source of truth for *what* the product must do.
`CLAUDE.md` is the source of truth for *how* it is built. Where a spec disagrees with this
document on product intent, this document wins; where this document strays into
implementation, `CLAUDE.md` wins. No technology is named in this document's body by design —
anything technical a requirement forces appears in §7 as a note for the architect.

**What it supersedes.** The capability-keyed PRD at `docs/PRD.md` (commit `116b918`) and,
before it, nine intent files at `docs/intent/` (commit `fe3c550`). The old `C1`–`C9` are now
`0001`–`0008`; §10 maps them. A scaffold requirement briefly numbered `0001` was removed on
2026-09-08 and became a constraint in §7 instead — see open question 6.

---

## 1. Problem

A learner attends a course. Every session leaves a trail: slides, a PDF, a photo of the
whiteboard, notes typed while trying to keep up. And every session leaves something second:
a fresh, fragile understanding of what just happened.

Both decay. Neither decay is noticed.

**The artifact decays into unfindability.** The file goes to Downloads and joins two hundred
others named `Lecture4_final_v2.pdf`. It is not lost — it is worse than lost, it is present
and unreachable. Nothing connects that file to what it was about, which course it belongs
to, or which class it came from.

**The understanding decays silently.** It fades over the following days, and nothing ever
asks the learner to produce it, so they never find out it is going. This is the expensive
decay and the invisible one. A learner can read a deck through and finish it feeling they
understood it. Recognition is not recall, and rereading reliably produces confidence
without producing competence. The feeling substitutes for the fact, and the difference
between them is discovered in the exam.

Three failures follow, and each has a bad substitute learners already reach for:

| Failure | What learners do instead | Why it fails |
|---|---|---|
| Can't find their own material | Search Downloads, open files one at a time | Correct, but so slow it doesn't happen |
| Can't check what they actually hold | Ask a general assistant | Answers instantly and confidently from the open internet, in notation their course does not use, at a depth it does not require, with no way to tell whether it matches what they will be examined on |
| Can't answer "am I ready?" | Count lectures attended; check whether the folder feels full; consult their anxiety | None of these correspond to whether they can do what the course demands |

Both halves of the answer to the third already exist and are never put side by side. The
course declared what it expects, in objectives nobody reads after week one. The learner has
been generating evidence about what they can actually do all term. Nothing brings the
expectation and the evidence together.

---

## 2. Users

### The learner

A learner taking a structured course. Structured means two things are true — the course
declares what it is trying to teach, and it happens as a series of sessions over time. Where
the course runs is irrelevant to the product: a training provider, a university, a
structured online program.

**Beachhead: semester-shaped courses** — a fixed run of weeks, declared objectives, a graded
event at the end. Not because other learners don't matter, but because the semester supplies
three things nothing else does: a cadence that makes *"did capture survive?"* measurable,
stakes that make self-testing worth doing, and objectives that already exist in a document.
A product that works here generalizes outward. One built for self-paced learners first has
no clock, no stakes and no objectives, and would be validated against nothing.

They arrive in four distinct situations, and the product is judged separately in each:

| Situation | Condition | What they want |
|---|---|---|
| Thirty seconds after class | In the corridor, on a phone, bad connection | Put the file somewhere and leave |
| Mid-assignment or revising | A specific question; already owns the material that answers it | An answer they can verify |
| The evening after a class | Willing to do real work | The work to return something |
| The week before the exam | Little time left | To know where to spend it |

### The operator

The person running AITutor during the first cohorts. A real user of requirement `0009` and
of nothing else. Not a learner, sees no learner content, and has no surface inside the
product.

### Not built for

Explicitly excluded, and the product should be *worse* for them: a reader with no course who
wants a general document question-answering tool; a team or study group wanting a shared
knowledge base; an instructor or institution wanting to distribute material or watch cohort
progress; and a learner who wants the answer without doing the work.

---

## 3. Journeys

### J1 — First capture
1. A learner meets the product holding one file they want to keep.
2. They create an account.
3. They create a course and say what it is meant to teach.
4. They add the session that just happened and attach the file.
5. They write, or decline to write, what they took from it.

**End state:** one course exists with one session in it, material attached, and the learner
has something to come back to.

### J2 — The weekly loop
1. A class ends.
2. Within a day or two, the learner adds that session and attaches its material.
3. They write what they took from it, from memory.
4. They are told what they got right, what they left out, and what they have wrong.
5. They revise, or go back to the material.

**End state:** the session is recorded, and the learner knows where their understanding
actually landed — while they can still do something about it.

### J3 — A question mid-assignment
1. The learner hits something they do not understand.
2. They choose which of their own sessions the question is asked against.
3. They ask it.
4. They get an answer naming the session it came from, or a plain statement that their
   material does not cover it.
5. They open the cited session and read the source.

**End state:** the question is answered in their course's own terms, and they have verified
it rather than trusted it.

### J4 — Preparing for a test
1. The learner picks one session, or a run of them.
2. They work through practice questions drawn from that material.
3. They see which parts they hold and which they do not.
4. They look at what the course expects, objective by objective, beside what they have
   actually done.
5. They choose what to study next from what is thinnest.

**End state:** the learner knows specifically where they are weak, early enough to act.

### J5 — Getting back in
1. The learner opens the product on the phone they always use, or on a borrowed computer
   because theirs is dead.
2. On the familiar device they are already in.
3. On the unfamiliar one they recover access using nothing they left at home.

**End state:** a term of accumulated work is reachable, from anywhere, at the moment it is
needed most.

### J6 — Operating the first cohort
1. The operator looks at whether learners are still capturing in week five.
2. They look at whether the effort-and-feedback loop is being repeated or tried once.
3. They see which material failed to process, and for whom, before anyone reports it.
4. They see what a learner costs to serve.

**End state:** the operator can tell a real problem from a quiet week, and can help a stuck
learner without asking them to explain their own bug.

---

## 4. Requirements

Every row gets an ID. That ID becomes the intent, the spec and the validation record.

| ID | Rank | Requirement | Serves journey | Intent |
|---|---|---|---|---|
| 0001 | 1 | A learner can create an account that makes their material durable, portable and private to them | J1 | `docs/intents/0001-register-an-account.md` |
| 0002 | 2 | A learner can reach their material from any device, and can recover access without anything they left at home | J5 | `docs/intents/0002-sign-in-again.md` |
| 0003 | 3 | A learner can create a course and declare, or confirm, what it is meant to teach | J1 | `docs/intents/0003-set-up-a-course.md` |
| 0004 | 4 | A learner can record that a class happened, attach its material, and add their own account of it | J1, J2 | `docs/intents/0004-capture-a-session.md` |
| 0005 | 5 | A learner can write what they took from a session and be told specifically what they missed or have wrong | J2 | `docs/intents/0005-check-my-summary.md` |
| 0006 | 6 | A learner can ask a question against sessions they choose and get an answer attributed to one of them | J3 | `docs/intents/0006-ask-my-course.md` |
| 0007 | 7 | A learner can practise against their own sessions and see what they can recall | J4 | `docs/intents/0007-quiz-me.md` |
| 0008 | 8 | A learner can see, objective by objective, what the course expects beside what they have done about it | J4 | `docs/intents/0008-see-my-readiness.md` |
| 0009 | 9 | The operator can see whether the loop is holding, and can help a stuck learner without that learner reconstructing the problem | J6 | `docs/intents/0009-know-its-working.md` |

**On the ranking.** `0001`–`0003` are the foundation: they pay nothing back on their own,
which is precisely why `0004` must follow immediately. `0004` precedes `0005` and `0006`
because it is the most direct test of whether the product's central bet holds. `0007` cannot
precede `0002` and `0004`, since it reads their output. `0008` is last to build but its
measurement must be emitted from the first commit onward — see §8.

**A precondition sits ahead of all of them.** The repository must be installable, testable and
runnable by a stranger before any requirement can ship into it. That has no user-visible
outcome, so it is recorded as a constraint in §7 rather than as a requirement here.

---

## 5. Acceptance

Every criterion is countable by a person. Where a number is an opening hypothesis rather
than a measured fact, it says so.

| ID | Countable criterion |
|---|---|
| 0001 | Five people register on a phone while timed. Count those finishing in under 60 seconds: at least four of five. |
| 0001 | Ask each of those five, unprompted, what the account is for. Count those who say the material is theirs and private: at least four of five. |
| 0001 | Count the fields a learner must fill to finish registration. Every one beyond those needed for durable, recoverable access is a defect. |
| 0001 | A learner exports their material and then deletes their account. Count what remains reachable afterwards: nothing. |
| 0002 | On a device used once before, count the credentials a learner types to reach their material again: zero. |
| 0002 | On a device the learner has never used and owns nothing on, they recover access using only what they can reach from that device. Count completions out of five attempts: five. |
| 0002 | Time the recovery path end to end. Count the minutes: under three. |
| 0003 | Time a learner from nothing to a course with at least one objective. Count the minutes: under five. |
| 0003 | A learner uploads a syllabus. Count the objectives offered as an editable draft, and count the ones imposed without confirmation: the second number is zero. |
| 0003 | Create a course with no objectives, then capture, ask and practise in it. Count the actions blocked: zero. Readiness says why it is unavailable. |
| 0004 | On a phone on a throttled connection, time a capture with one file and no written account. Count the minutes: under two. |
| 0004 | Capture a session with a file and nothing written. Count the errors and required fields: zero. |
| 0004 | Attach material that exceeds the platform's ceiling. Count the cases where the learner is told what happened and what to do instead: all of them. |
| 0004 | Three months after a capture, a learner finds that session's material. Count the steps: no more than three. |
| 0005 | Submit a summary that omits a known point from the session. Count the feedback lines naming that specific omission and where it lives: at least one. |
| 0005 | Submit a summary omitting something the session never covered. Count the times it is reported as the learner's error: zero. |
| 0005 | Count what the product shows before the learner has submitted anything that would let them assemble a summary without recalling it: nothing. |
| 0005 | Revise and resubmit a summary. Count the attempts permitted: more than one. |
| 0006 | Ask twenty questions against a chosen scope. Count the answers citing a session outside that scope: zero. This one cannot be rounded. |
| 0006 | Count the answers shown without an attributable session: zero. |
| 0006 | Ask something the chosen material does not cover. Count the times the answer says so plainly and names what appears missing, rather than offering a guess: all of them. |
| 0006 | Follow a citation. Count the clicks to the source material itself rather than a paraphrase of it: one. |
| 0007 | Generate practice for a single session. Count the sessions required: one. |
| 0007 | Show ten generated questions to a learner who attended that course. Count those they recognise as their own course rather than generic: at least eight. |
| 0007 | Finish a practice run. Count the results that name what to do next, not only a score: all of them. |
| 0008 | Open readiness on a course with objectives. Count the objectives shown with no material and no practice against them: all such objectives appear, none is omitted or pushed below what the learner has already invested in. |
| 0008 | Count the grade predictions or score estimates shown: zero. |
| 0008 | Open readiness on a course with no objectives. Count the times it says so and points at fixing it, rather than showing an empty page: all of them. |
| 0009 | Ask the operator, for a given week, the share of active courses that added a session. Count the minutes to an answer: under five. |
| 0009 | Break a learner's material processing deliberately. Count the hours before the operator can see it without being told: under 24. |
| 0009 | Count the places in the operator's view where a learner's own words or material content are readable: zero. |
| 0009 | Ask the operator what one learner cost to serve last month. Count the minutes to an answer: under five. |

---

## 6. Out of scope

Named, with the reason. The reason is the load-bearing part — an exclusion without one gets
reopened every quarter.

| Not building | Because |
|---|---|
| Sharing, shared course spaces, any social layer | A summary written to be seen by others is written to score well, not honestly — it would destroy the one signal `0005` depends on |
| Instructor or institutional reporting | It inverts the customer. The moment an instructor is a reader, the learner starts performing |
| Integration with an institution's course system | Requires an institutional agreement. v1 must stand alone without one, or it cannot be validated by a single motivated learner |
| Recording or transcribing lecture audio | Would supply the learner's account of the session *for* them — the one thing that must stay theirs |
| Notifications, streaks, pre-lecture prompting | A later phase. Building it now would let engagement mechanics substitute for real payback, hiding whether the payback exists |
| Ads, pricing, or any revenue mechanic | Deferred by decision; needs its own document. Cost to serve appears here only as a constraint |
| Cross-course questions and practice | Scope is the learner's to set, and a question spanning courses has no clean set of sessions to check an answer's attribution against |
| Spaced repetition and scheduling | Assumes the product knows better than the learner what to do next. Readiness informs that decision; it does not make it |
| Any account type other than a single learner | The account is the privacy boundary |
| Verifying that a learner attends a given institution | The product must not imply anyone has been vouched for |

---

## 7. Constraints

| Constraint | Source | Note for the architect |
|---|---|---|
| The repository must be installable, testable and runnable by a stranger from written instructions alone | engineering | Precedes every requirement. Countable: a person who has never built this project follows the instructions and reaches a passing test run — steps they had to work out themselves, zero; commands to start it, no more than two. This was briefly a requirement and is now a precondition; see open question 6 |
| Serving one active learner must stay near $1–2 per month | budget | This is why scope is the learner's to set and why cross-course work is excluded. `CLAUDE.md` pins the model tier, the caching policy and the per-interaction budget; a change that multiplies tokens per interaction is a business decision, not a technical one |
| Cost is driven by how many pages of material enter a request, not by file size | platform | One page bills roughly as one image. `CLAUDE.md` holds the detail. A "whole course" scope is not merely slower than a three-session scope, it is dramatically more expensive |
| Attached material has hard ceilings on size and page count | platform | Exact ceilings are in `CLAUDE.md`. Requirement `0004` must fail legibly at the boundary rather than accept something that silently never becomes usable |
| No outside guarantee of citation correctness exists for the learner's own documents | platform | Correctness is therefore this product's own responsibility to check, not something to request and trust. `CLAUDE.md` holds the enforcement mechanism and treats it as non-negotiable |
| Answers may draw only on material the learner added themselves | product invariant | Never general knowledge, never blended quietly. "Your material doesn't cover this" is a correct outcome |
| The learner's own account of a session must never be written for them | product invariant | Transcribing something they already have (objectives out of a syllabus) is fine. Producing their understanding is not |
| Every act of capture must return something visible within seconds | product invariant | Delayed or invisible payoff is the exact condition that already stops learners reviewing |
| A course belongs to one learner; nobody else reads their material | product invariant / privacy promise | Includes the operator. `0009` sees behaviour and operations only |
| The operator may see learner content only with that learner's consent for that case, recorded | privacy promise | Build the consent and the record, not a bypass |
| Capture must complete on a phone, outdoors, on a poor connection | user | Plan for work that finishes after the learner has closed the page |
| Structural retrieval over the learner's own organizing, not similarity matching over everything they own | product thesis | The learner has already said which session each piece of material belongs to; that act is the index. Replacing it is a thesis-level decision and needs a superseding ADR, not an optimisation |
| Each of the learner-facing actions is a single structured request against known material | product thesis | No open-ended exploration is involved, so an orchestration loop would add latency, cost and failure modes for capability that is never used |

---

## 8. Risks

| Risk | Likelihood | What would tell us early |
|---|---|---|
| Capture dies around week three, as it does in every note-taking product | High | Share of active courses adding at least one session in week 4 falls below 50%, or below 35% in week 6 |
| The effort-and-payback loop is tried once and not repeated | High | Fewer than 40% of learners who check one summary check a second within seven days |
| Courses end up with no objectives, silently disabling `0008` | High | Share of created courses carrying at least one objective falls below 70% |
| An answer cites the wrong session and nobody notices, teaching learners to stop checking | Medium — and catastrophic | A single surfaced answer citing a session outside the scope that was sent |
| Generated practice reads as generic and gets dismissed | Medium | Practice runs abandoned partway, or learners reporting the questions are not their course |
| Readiness is read and then ignored | Medium | Fewer than 30% of readiness views followed within 48 hours by capture or practice on a flagged objective |
| Cost per learner runs away before anyone looks at the bill | Medium | Monthly spend per active learner exceeds the §7 budget constraint |
| Material fails to process, the learner concludes the product is broken, and nobody finds out | Medium | Any processing failure older than 24 hours that the operator has not seen |
| The product optimises for engagement and quietly works against its own purpose | Medium | Anyone proposing time-in-product, session length, or questions-asked as a goal. These are anti-metrics: each can be raised by making the product worse. A learner who captures, checks a summary and closes the tab in four minutes is the success case |

**Definitions for the numbers above.** An *active learner* performed at least one capture,
ask, summary check or practice run in the trailing 30 days. An *active course* belongs to an
active learner and has at least one session captured. Both are counted from behaviour, never
from sign-in. Every threshold here is an opening hypothesis to be calibrated against the
first cohort; the shape of each risk is the committed part, not its constant.

---

## 9. Open questions

1. **Does the week-four measure survive the widening in §2?** Requirements are written for
   learners on any structured course, but the top two risks in §8 are measured in *weeks of
   term*. A self-paced learner has no week four. Either those measures need restating against
   the learner's own elapsed span, or the beachhead becomes a hard v1 constraint and the
   widening waits. Blocks the exact wording of two risk signals; blocks no requirement.
2. **What is a session when nothing schedules one?** On a semester course it is a class that
   happened. Self-paced, the learner draws the boundary — and if they draw it badly (one
   session for a whole module) then scope in `0006` goes coarse, attribution stops being
   useful, and `0008` goes flat. Should the product shape that boundary, and if so how,
   without producing the learner's thinking for them?
3. **What does `0003` offer a learner with no syllabus?** `0008` needs objectives; `0003` gets
   them most cheaply from a document the learner already has. Many do not have one, or have one
   listing topics rather than outcomes. If most courses end up with no objectives or poor ones,
   `0008` degrades to an empty page and the learner never learns why. Blocks whether `0008`
   can be validated in the first cohort at all.
4. **Should a low-confidence objective extraction be shown at all?** `0003` presents extracted
   objectives as a draft to confirm. If extraction is poor, the learner's first experience of
   the product's judgement is a bad one, before anything has paid back.
5. **Is `0002` really rank 3?** A learner cannot return before they have something to return
   to, which argues for ranking it after `0003` and `0004`. It is ranked third because the
   cost of being locked out rises with every week of accumulated work, and retrofitting
   recovery onto an account system is worse than building it alongside. Worth challenging.
6. **Is the repository scaffold a requirement or a constraint?** *Decided 2026-09-08: a
   constraint.* It delivers nothing a learner can see, so it does not belong in a document about
   user-visible outcomes. It is recorded in §7 with its countable criteria intact, and it still
   precedes every requirement. Requirement IDs shifted accordingly — what were `0002`–`0010`
   are now `0001`–`0009`, and `docs/intents/0001-scaffold-the-repository.md` was removed.
   Anything written before that date, including ADRs 0003 and 0004 and the published PRD
   artifact, refers to the old numbering.
7. **Who is the operator, concretely?** `0009` assumes one person during the first cohorts.
   Whether that is one named individual or a rotating role changes what the consent record in
   §7 has to capture.
8. **How is an active learner counted before there is a cohort?** The definitions in §8 assume
   enough learners for a share to mean something. Below roughly twenty, every percentage is
   noise, and the early read has to be qualitative. Unresolved what the operator looks at in
   week one.

---

## 10. Retained product material

The following held up under review and is kept rather than restated inside individual
intents, because each is cross-requirement and belongs to the product as a whole.

### Thesis

AITutor is a **co-learner that runs the whole course loop** — prepare, capture, understand,
organize, practice. It is not a search box over a pile of files, and every time it drifts
toward being one it gets worse. Three claims hold it up:

1. **The learner's effort is the mechanism, not friction to be removed.** Finding a resource,
   assigning it to the session it belongs to, and putting it in their own words is generative
   work, and generative work is what produces retention. A competitor that removes this work
   builds something that feels faster and teaches nothing.
2. **Effort must pay back immediately and visibly.** Claim 1 is only survivable because of
   this one. Learners will not do generative work on faith.
3. **The learner's organizing is the index.** They have already said which session each piece
   of material belongs to. That act is what makes it possible to answer from the right
   material — so the organizing effort is not overhead, it is the thing that makes the product
   work.

### The loop

```
   PREPARE ──▶ CAPTURE ──▶ UNDERSTAND ──▶ PRACTICE ──┐
    0003        0004        0005, 0006      0007     │ repeats each session
      ▲           ▲             │             │      │
      └───────────┴──────┬──────┴─────────────┴──────┘
                         ▼
                   ORIENTATE  0008
              objectives beside evidence
              ──▶ back to prepare / capture
```

Read it as a cycle, not a funnel. **Organizing is a fifth stage that is deliberately not a
separate step** — it happens inside capture, when the learner assigns material to a session.
There is no filing step and there must never be one. And orientation is unavailable without
preparation: no objectives, no readiness. That is open question 3.

### Build phases

Ordered, undated. Each exits on evidence, not on a date.

| Phase | Requirements | Exits when |
|---|---|---|
| P0 | 0001, 0002, 0003, 0004 | A learner completes J1 on a phone, and material processing failures are the exception. **Deliberately unrewarding** — nothing here pays back, which is why P1 must follow immediately and P0 must not be extended |
| P1 | 0005, 0006, 0007 | `0005` in this order first. The repeat-use risk in §8 is measurable and inside threshold, and `0006` shows no out-of-scope attribution at all |
| P2 | 0008 | The readiness risk in §8 is measurable |
| P3 | 0009 | **Build last, measure from the start.** The signals in §8 must be emitted from `0001` onward or the first cohort produces no answers. The dashboard is late; the measurement is not |

Deferred beyond v1: the companion layer in §6 (notifications, prompting, streaks). Deferred
rather than cancelled, because it is the obvious lever on the week-three risk — and it must
stay unavailable until that risk has been measured *without* it. Otherwise engagement
mechanics mask whether the payback is real and the product ships on a false positive.

### ID mapping from the superseded PRD

| Was | Now | Requirement |
|---|---|---|
| C1 | 0001 | Register an account |
| C2 | 0002 | Sign in again |
| C3 | 0003 | Set up a course |
| C4 | 0004 | Capture a session |
| C5 | 0005 | Check my summary |
| C6 | 0006 | Ask my course |
| C7 | 0007 | Quiz me |
| C8 | 0008 | See my readiness |
| C9 | 0009 | Know it's working |

The nine intent files at `docs/intent/` in commit `fe3c550` are the origin of requirements
`0001`–`0009` and can be recovered with
`git show fe3c550:docs/intent/<name>.md`. The nine specs beside them predate this document
and are reference, not authority. UI mockups for every requirement except `0001` exist at
`design/aitutor-ui/` in the same commit.
