# AITutor — Product Requirements

## 0. About this document

**Status:** Pre-implementation. Nothing is scaffolded. No learner has used this.

**Reader:** the people building it. This document is dense on purpose. Its job is to
stop scope being re-litigated and to be the thing every feature spec traces back to.

**Precedence.** This PRD is the source of truth for *what* AITutor is and what it must
do. `CLAUDE.md` is the source of truth for *how* it is built — stack, platform
constraints, model selection, the architecture. Where a spec disagrees with this
document, this document wins; where this document strays into implementation, it is
wrong and `CLAUDE.md` wins.

**What it supersedes.** Nine intent files at `docs/intent/` and nine matching technical
specs at `docs/specs/` (commit `fe3c550`) were deliberately removed. The business
content of the intent files is absorbed into §6 — that section is not a summary of them,
it replaces them. The specs stay in history as reference and will be rewritten against
this document. It also supersedes the line in `CLAUDE.md` reading *"Wedge user:
university students (MENA)"* — see §2.

**What is deliberately not here.** Architecture, data model, stack, model selection, and
the citation enforcement mechanism: all in `CLAUDE.md`. Pricing and monetization: out of
scope by decision. Cost-to-serve appears in this document only as a product constraint
(§11), never as revenue.

---

## 1. The problem

A learner attends a course. Every session leaves a trail: slides, a PDF, a photo of the
whiteboard, notes typed while trying to keep up. And every session leaves something
second: a fresh, fragile understanding of what just happened.

Both decay. Neither decay is noticed.

**The artifact decays into unfindability.** The file goes to Downloads and joins two
hundred others named `Lecture4_final_v2.pdf`. It is not lost — it is worse than lost, it
is present and unreachable. Nothing in the learner's life connects that file to what it
was about, which course it belongs to, or which class it came from.

**The understanding decays silently.** It fades over the following days, and nothing ever
asks the learner to produce it, so they never find out it is going. This is the
expensive decay and the invisible one. A learner can read a deck through and finish it
feeling they understood it. Recognition is not recall, and rereading reliably produces
confidence without producing competence. The feeling substitutes for the fact, and the
difference between them is discovered in the exam.

Three failures follow, and each one has a bad substitute that learners already reach for:

| Failure | What learners do instead | Why it fails |
|---|---|---|
| Can't find their own material | Search Downloads, open PDFs one at a time | Correct but so slow it doesn't happen |
| Can't check what they actually hold | Ask a general AI assistant | Answers instantly and confidently from the internet, in notation their course does not use, at a depth their course does not require, with no way to tell whether it matches what they will be examined on |
| Can't answer "am I ready?" | Count lectures attended; check whether the folder feels full; consult their anxiety | None of these correspond to whether they can do what the course demands |

The strange part about the third one is that both halves of the real answer already
exist and are never put side by side. The course declared what it expects, in objectives
nobody reads after week one. The learner has been generating evidence about what they can
actually do all term. Nothing brings the expectation and the evidence together.

So the whole term is lost in this gap. Learners intend to review, and do not. By the time
either the file or the understanding is needed, one is unfindable and the other is gone.

---

## 2. The learner

**Primary user: a learner taking a structured course.** Structured means two things are
true — the course declares what it is trying to teach, and it happens as a series of
sessions over time. Where that course runs is irrelevant to the product: a training
provider such as Station J, a university, a structured online program.

This is a widening of the wedge previously stated in `CLAUDE.md`. It buys a larger
market and costs sharpness — see the open question in §9.1, which is real and is not
resolved here.

**Beachhead: semester-shaped courses.** Build and validate against courses with a fixed
run of weeks, declared objectives, and a graded event at the end. Not because other
learners don't matter, but because the semester supplies three things nothing else does:
a natural cadence that makes "did capture survive?" measurable, real stakes that make
self-testing worth doing, and objectives that already exist in a document. A product that
works here generalizes outward. One built for self-paced learners first has no clock, no
stakes, and no objectives, and would be validated against nothing.

**The learner shows up in four distinct moments,** and the product is judged separately in
each:

- **In the corridor, thirty seconds after class**, holding a file, on a phone, on a bad
  connection. Wants to put it somewhere and leave.
- **Mid-assignment or revising**, with a specific question, already in possession of the
  material that answers it.
- **The evening after a class**, willing to do real work if the work returns something.
- **The week before the exam**, with little time left, needing to know where to spend it.

**A second user exists.** The person running AITutor is a real user of one capability
(C9) and of nothing else. They are not a learner, they see no learner content, and they
have no surface inside the product. Everything else in this section is about learners.

**Anti-personas.** Explicitly not built for, and the product should be *worse* for them:

- A reader with no course, wanting a general document Q&A tool.
- A team or study group wanting a shared knowledge base. §4 / I3 forbids it.
- An instructor or institution wanting to distribute material or watch cohort progress.
  There is no instructor surface, in any phase.
- A learner who wants the answer without doing the work. Every design decision in §4 makes
  this product less useful to them, and that is the intent, not a side effect.

---

## 3. Product thesis

AITutor is a **co-learner that runs the whole course loop** — prepare, capture,
understand, organize, practice. It is not a document search tool with a chat box, and
every time it drifts toward being one it gets worse.

Three claims hold the product up. If any is false, this is the wrong product.

**Claim 1 — the learner's effort is the mechanism, not friction to be removed.**
Finding a resource, assigning it to the session it belongs to, and putting it in their own
words is generative work, and generative work is what produces retention. A competitor
that removes this work builds something that feels faster and teaches nothing. The
distinction that matters: automating *transcription* is fine — pulling objectives out of a
syllabus the learner already has takes nothing away. Automating *comprehension* destroys
the product.

**Claim 2 — effort must pay back immediately and visibly.** Claim 1 is only survivable
because of this one. Learners will not do generative work on faith. Every act of capture
has to return something they can see within seconds: a specific account of what their
summary missed, a coverage bar moving, a practice result. Delayed, invisible payoff is
exactly the condition that already causes learners to intend to review and not do it.

**Claim 3 — structure replaces retrieval.** The learner has already told us which session
each piece of material belongs to. That organizing act is not metadata, it *is* the
retrieval index. So scoping an answer is a structural query over sessions the learner
chose, not a semantic search over a vector space. This is simpler, and it is the truer
expression of the thesis: the learner's organizing effort is literally what makes
retrieval work. If it is later replaced with semantic search, the product will still
function and will have stopped being this product.

---

## 4. Product invariants

Five non-negotiables. These are decisions, not gaps. Each states what it forbids, because
the forbidding is the useful part.

### I1 — The learner's effort is the mechanism, not friction

*Why:* generative work produces retention; removing it produces a filing cabinet.

*Forbids:* writing a learner's summary for them, offering to; generating their notes;
answering in a way that removes the need to read the source; any feature justified by
"this saves the learner from having to…" where the thing saved is comprehension.

*Permits:* automating transcription — extracting objectives from an uploaded syllabus,
labelling a file with the session it was attached to.

### I2 — Effort pays back immediately and visibly

*Why:* I1 is unsurvivable without it.

*Forbids:* capture flows that end in a confirmation and nothing else; feedback that
arrives on a delay; progress that is real but invisible; work whose value is asserted
rather than shown.

### I3 — Single-learner and private

*Why:* the account is the privacy boundary, and the promise that a course belongs to one
person is what makes learners willing to put honest, unflattering work into it. A summary
written to be seen by someone else is a summary written to score well, and worthless.

*Forbids:* shared course spaces, crowd-sourced material, any social layer, any
instructor or institutional view, comparison against other learners, cohort averages.
Includes the operator: §6 / C9 sees behaviour and operations, never content.

### I4 — Answers are grounded in the learner's own material

*Why:* the entire trust proposition. An answer from general knowledge is available
everywhere and checkable nowhere.

*Forbids:* answering from model knowledge when the learner asks about their course;
quietly blending general knowledge with their material; filling a gap with a plausible
guess. *"Your material doesn't cover this"* is a correct outcome, expected, and must be
said plainly along with what appears to be missing.

### I5 — Citations are validated, never trusted

*Why:* a confidently wrong citation is worse than refusing to answer, because it teaches
the learner to stop checking — and checking is where the learning happens.

*Forbids:* surfacing any answer whose cited sessions are not provably inside the scope
that was actually sent. Out-of-scope citation is a hard error: retry, never surface. An
answer that cannot be attributed to a session does not get shown at all.

*Note:* the model provides no citation guarantee for supplied documents. This invariant is
enforced in our own code. `CLAUDE.md` holds the mechanism.

---

## 5. The loop

```
                    ┌──────────────────────────────────────┐
                    │                                      │
                    ▼                                      │
   ┌─────────┐  ┌─────────┐  ┌────────────┐  ┌──────────┐  │
   │ PREPARE │─▶│ CAPTURE │─▶│ UNDERSTAND │─▶│ PRACTICE │──┘
   └─────────┘  └─────────┘  └────────────┘  └──────────┘
        │            │             │              │
        │            │             │              │
   set up a     capture a     ask my course    quiz me
    course       session      check my summary
   (C3)          (C4)         (C6)  (C5)         (C7)
        │            │             │              │
        └────────────┴──────┬──────┴──────────────┘
                            ▼
                    ┌───────────────┐
                    │   ORIENTATE   │   see my readiness (C8)
                    └───────────────┘
                     objectives vs. evidence
                     → routes back to PREPARE / CAPTURE
```

Read it as a cycle, not a funnel. **Prepare** declares what the course expects, once.
**Capture** marks that a class happened and attaches what came out of it. **Understand**
is where effort first pays back — the learner produces a summary from memory and is told
where it landed, or asks a question and gets an answer they can go verify. **Practice**
converts recognition into recall. **Orientate** is the only stage that reads across all
the others: it puts the course's declared expectations beside the evidence the learner has
generated, and answers *what should I do next* — which routes them back to capture or
practice on whatever is thinnest.

Two structural facts fall out of this diagram:

1. **Organizing is the fifth stage named in §3, and it is not a separate step.** It
   happens inside capture, at the moment the learner assigns material to a session. That
   single act is what makes every downstream stage possible (Claim 3). This is why the
   diagram shows four stages and not five: there is no filing step, and there must never
   be one. A design that adds one has misread the thesis.
2. **Orientation is unavailable without preparation.** No objectives, no readiness. This
   is a real cold-start risk, tracked in §9.5.

---

## 6. Capabilities (v1)

Nine capabilities in four groups. Acceptance criteria are externally observable — they
describe what a learner can do and see, never how it is built.

### Group A — Foundation

Nothing here pays back on its own. It exists so the rest can.

---

#### C1 — Register an account

**Outcome.** A learner ends up with an account that makes their work durable, portable and
private, reached with the least possible interruption to whatever they came to do.

**Why it exists.** A learner in the corridor holding a file meets a signup form. That is
where most of them leave — not because registering is hard, but because it arrives before
the product has done anything for them. And yet the account is not bureaucracy: it is what
makes the material survive a lost phone, and it is the boundary that makes I3 true.
Registration is simultaneously the thing that makes the central promises real and the
largest point of abandonment, sitting at the worst possible moment. Signing up should feel
like securing something, not paying a toll.

**Acceptance criteria.**
- Registration completes on a phone, on a poor connection, in under a minute.
- What the account is *for* — this is where your material lives, only you can see it — is
  evident at the moment of signing up, not buried in a policy page.
- Only what is required for durable, recoverable access is collected. Every additional
  field is a defect until justified.
- No institutional affiliation is required or verified, and nothing implies the learner has
  been vouched for by an institution.
- A learner can delete their account and material, and take their material with them.

**Out of scope.** Institutional SSO; verifying enrolment; paid plans or payment details;
invitations or referrals; any account type other than a single learner.

---

#### C2 — Sign in again

**Outcome.** A returning learner reaches their material reliably from any device without
ceremony. On their usual phone it is effectively instant. On an unfamiliar device in a bad
moment it takes a couple of minutes and needs nothing they left at home.

**Why it exists.** By late term a learner has forty sessions, their own summaries, practice
results, and a readiness picture assembled over months. That accumulation is the entire
reason to keep using the product, and it is exactly what makes being locked out
catastrophic in a way it was not in week one. The moments they need back in are the worst
possible moments to be blocked: a new phone, a borrowed library computer, two in the
morning in exam week, a credential chosen months ago and never typed since. Recovery is a
first-class path, not an afterthought, because a term of irreplaceable work sits behind it.

**Acceptance criteria.**
- Returning on a personal device requires no thought and no repeated re-authentication.
- Recovery exists, always, and depends on nothing the learner cannot reach from a borrowed
  computer.
- Access is reachable from a device the learner does not own and will never use again.
- Only the account holder gets in. Recovery must not become a second door — I3 is only as
  strong as this path.
- Signing in does not stand between a learner and the moment of capture any longer than
  strictly necessary.

**Out of scope.** Institutional SSO; device management or remote sign-out; delegated access
to another learner's account; mandatory two-factor or anything requiring a second physical
device.

---

#### C3 — Set up a course

**Outcome.** Every course the learner is taking has a named place that knows what the
course is trying to teach. Objectives are declared once, up front, so everything added
later can be measured against something. Setup takes a couple of minutes, and starting
mid-term feels normal rather than like arriving late to something already ruined.

**Why it exists.** A learner carrying five courses has a home for none of them. Nothing
holds the *shape* of a course — what it is supposed to teach, and where they stand against
that — so "am I behind?" stays a feeling. The information that would make it a fact
already exists: providers publish learning outcomes and nobody reads them, so the one
artifact that defines what a course expects goes unused all term.

**Acceptance criteria.**
- A learner goes from nothing to a course with objectives in place in under five minutes.
- Objectives can be extracted from a syllabus the learner uploads, presented as a **draft
  they confirm and edit** — never as fact imposed on them. (Transcription, permitted by I1.)
- Objectives remain editable for the life of the course.
- A course is fully usable with **no** objectives: capture, ask, and practice must never be
  blocked behind setup. Only readiness (C8) is unavailable, and it says so and points at
  the fix.
- A course belongs to one learner. There is no shared, official, or verified course record
  to join.

**Out of scope.** Importing courses or enrolment from an institutional system; a shared
catalogue or templates of known courses; timetables or anything calendar-shaped; any notion
of a course being official, verified, or instructor-owned.

---

#### C4 — Capture a session

**Outcome.** Each class that happened has a marked place in its course, with its material
attached and — when the learner does the work — their own account of what it covered. The
file stops being an anonymous download and becomes *session 5 of Thermodynamics, the one
about entropy*.

**Why it exists.** This is where both decays in §1 are arrested, and it is the single act
the whole product depends on. It is also where the learner performs the organizing work
that Claim 3 turns into retrieval. If capture dies, nothing downstream has anything to
operate on.

**Acceptance criteria.**
- Capture works from a phone, immediately after class, on a bad connection, in a minute or
  two.
- Capture succeeds with **only** a file and nothing to say about it. Writing an account is
  always invited and never required — the moment it is required, capture stops happening.
- The invitation to write what they took away arrives *here*, while the memory is warm,
  not in exam week.
- Sessions can be added late, out of order, or in a rush, without penalty and without
  nagging. Learners fall behind; the product absorbs that rather than moralizing about it.
- A learner can find a specific session's material months later without hunting.
- The learner's account of the session is their work: it may be prompted, questioned, or
  responded to, and must never be written for them and offered back as theirs (I1).
- When attached material fails to process, the learner is told, in that session, with
  something they can do about it.

**Out of scope.** Recording or transcribing lecture audio; reminders, streaks, or any
prompting to capture; pulling material automatically from an institutional system; live
note-taking during the lecture.

---

### Group B — Payback

Where effort returns something visible. I2 lives or dies here.

---

#### C5 — Check my summary

**Outcome.** The learner writes what they took from a session in their own words and gets
back a specific account of what they got right, what they left out, and what they have
subtly wrong.

**Why it exists.** The only way to find out what a learner actually holds is for them to
produce it from memory and compare it against the source. Almost none of them do, and the
reason is simple: there is nobody to compare against. Grading your own summary requires
already knowing the thing you are trying to discover you don't know. A learner cannot mark
their own blind spots, because they are blind spots. **This is the capability that most
directly proves the thesis** — the effortful, genuinely valuable act finally has a
response, and that response is what makes it worth doing a second time.

**Acceptance criteria.**
- The learner writes first. Nothing is shown beforehand that would let them assemble a
  summary without recalling one.
- Feedback names **specific** missing or mistaken content and locates it in the session.
  The learner can act on it within the next ten minutes.
- Feedback is measured against the session's own material, not general subject knowledge.
  A learner is not wrong for omitting something their instructor never taught.
- The learner can revise and resubmit.
- Tone makes an incorrect summary feel like useful information, never judgment. The moment
  it feels like judgment, learners start writing summaries designed to score well instead
  of honest ones, and the capability is dead.
- The system never writes the summary, never offers to, and never shows a model answer
  before the learner has committed to theirs (I1).

**Out of scope.** Grades, scores, or marks on a summary; comparison against other learners;
checking one summary across several sessions at once; rewriting or improving the learner's
text for them.

---

#### C6 — Ask my course

**Outcome.** The learner asks a question and gets an answer built from their own material,
pointing at the session it came from. The answer is checkable — they can open the source
and read it. When their material does not answer the question, they are told so plainly
instead of handed a plausible guess.

**Why it exists.** Two things change versus the alternatives in §1. The answer arrives in
the course's language and notation rather than the internet's. And the citation turns the
answer from something to be trusted into something to be verified — which sends the learner
back into their own source material, which is where the learning actually happens.

**Acceptance criteria.**
- Every answer cites a session, and the citation is correct when checked. **This is the one
  bar that cannot slip** (I5).
- An answer that cannot be attributed to a session is not shown at all.
- The learner sets the scope a question is asked against. Scope is theirs to choose, not
  ours to infer silently.
- Following a citation lands the learner in the source material, not in a paraphrase of it.
- "Your material doesn't cover this" is said plainly, and says what appears to be missing.
- Answers are never built from general knowledge and never quietly blended with it (I4).
- Answering points at the source; it does not stand in for reading it.

**Out of scope.** Questions spanning several courses at once; drawing on textbooks, the web,
or any source the learner has not added themselves; working assignments end-to-end on the
learner's behalf; memory carried across separate conversations.

---

#### C7 — Quiz me

**Outcome.** The learner gets practice questions drawn from their own sessions — their
instructor's emphasis, their course's notation, the material actually covered. They can
test one session before the next class, or a run of sessions before an exam. Afterwards
they know which parts they hold and which they do not, specifically enough to act before
it is graded.

**Why it exists.** Self-testing is the most effective study technique there is, and almost
nobody does it, because writing good questions about material you have not mastered is
harder than studying it. Ready-made question banks fail differently: they test a generic
version of the subject rather than the one this instructor taught, so a good score gives a
confidence reading that does not correspond to the exam actually coming.

**Acceptance criteria.**
- Practice is available for a **single session** as readily as for many. The five-minute
  check before Tuesday's class matters as much as the exam cram.
- Questions are recognizably about *this* course. If learners dismiss them as generic, the
  capability has failed regardless of how well it performs on any other measure.
- Results tell the learner what to do next, not merely how they scored.
- Getting questions wrong feels like information, never judgment — same reasoning as C5.
- Practice tests what was taught. Something the course never covered is a coverage gap and
  belongs to readiness (C8); it is not a question the learner should be marked wrong on.

**Out of scope.** Spaced repetition or scheduled review; shared, exported, or importable
question sets; timed runs or exam-simulation modes; questions spanning several courses.

---

### Group C — Orientation

---

#### C8 — See my readiness

**Outcome.** The learner sees, objective by objective, what the course expects and what
they have actually done about it: whether material exists for it, whether they have tested
themselves on it, and how that went. *"Am I behind?"* becomes a question with an answer.
More usefully, *"what should I do next?"* gets a specific one instead of vague dread.

**Why it exists.** It closes the loop (§5) by putting the two halves from §1 side by side
for the first time. It is also the capability that makes a term's accumulated effort
**visible** — the I2 payoff at term scale rather than at interaction scale — which is what
keeps effort worth making in the weeks when no exam is close enough to supply motivation.

**Acceptance criteria.**
- Readiness reports **evidence, never a predicted grade**. It says what the learner has and
  has not done, not how they will score.
- It is honest about thin evidence. A gap looks like a gap even when the learner has been
  working hard elsewhere.
- **Untouched objectives are the most important thing it shows** and must not be crowded out
  by areas already invested in. Surfacing what is being avoided is the whole point.
- Where no objectives exist, it says so and points at fixing that, rather than presenting a
  confident empty state.
- What it flags as thin is directly actionable — the learner can go from the flag to
  capturing or practising that objective without hunting.

**Out of scope.** Sharing readiness with instructors, institutions, or parents; predicted
grades or score estimates; comparison against other learners or cohort averages; planning
the learner's week or scheduling their study time.

---

### Group D — Operator

---

#### C9 — Know it's working

**Outcome.** The person running AITutor can see whether the core loop is holding, and can
help a stuck learner without asking that learner to explain their own bug.

**Why it exists.** During the first cohorts, the operator cannot answer the only question
that matters: is it working? Not whether servers are up — whether learners are doing the
thing the product depends on. Did capture quietly die in week three, the way it dies in
every note-taking product ever built? Does a learner who checks one summary come back and
check a second? Are answers actually cited correctly, or are some confidently wrong and
unnoticed? The operational failures are invisible too: a deck that failed to process, so
the learner concluded the product is broken and stopped opening it; a learner costing more
to serve than any realistic subscription covers. Without this, every decision about what to
build next is a guess, a quiet week is indistinguishable from a broken product, and support
means asking learners to debug on your behalf.

**Acceptance criteria.**
- The riskiest assumptions in §8 are answered with observed behaviour, not argument.
- Processing failures are visible to the operator **before** a learner reports them.
- A support question can be answered without asking the learner to reproduce anything.
- Cost per learner is known, and a learner whose usage is running away is visible well
  before the bill arrives.
- **The operator sees behaviour and operations, never content** (I3). That a capture
  happened, that a document failed, what it cost to serve — yes. What a learner wrote in a
  summary, or what their slides say — no.
- Where a support case genuinely cannot be resolved without content, it requires that
  learner's explicit consent for that case, and the access is recorded.
- Aggregate answers are preferred to individual ones. The question is nearly always "is
  this working across the cohort".
- It measures behaviour indicating learning, not engagement for its own sake (§8.3).

**Out of scope.** Any instructor-facing or institution-facing reporting; billing or
subscription administration; content moderation queues; editing a learner's material or
acting from inside their account; staff roles, permissions, or multiple operator accounts;
experimentation or A/B infrastructure.

---

## 7. Non-goals for v1

Excluded deliberately. The reason is the load-bearing part — an exclusion without one gets
reopened every quarter.

| Not building | Because |
|---|---|
| Sharing, shared course spaces, any social layer | I3. A summary written to be seen by others is written to score well, not honestly — it would destroy the one signal C5 depends on. |
| Instructor or institutional reporting | I3, and it inverts the customer. The moment an instructor is a reader, the learner starts performing. |
| LMS integration (Moodle / Blackboard / Canvas) | Requires an institutional agreement. v1 must stand alone without one, or it cannot be validated by a single motivated learner. |
| Lecture audio recording or transcription | Would supply the learner's account of the session *for* them. Directly violates I1 — this is comprehension, not transcription. |
| Notifications, streaks, pre-lecture prompting | The companion layer, a later phase. Building it now would let engagement mechanics substitute for the payback in I2, hiding whether the payback is real. |
| Ads or revenue mechanics | Out of scope by decision. See §9.3. |
| Agent frameworks and agentic loops | All five learner-facing actions are single structured calls against known material. None involves open-ended exploration, so a loop adds latency, cost, and failure modes for capability that is not used. |
| Vector database, embeddings, semantic search | Claim 3. The learner has already told us which session material belongs to; substituting semantic retrieval discards the organizing effort that is the product thesis. Held in reserve, not adopted — see §11. |
| Cross-course questions and practice | Scope is the learner's to set (C6), and a question spanning courses has no clean session scope to validate citations against (I5). |
| Spaced repetition and scheduling | Assumes the product knows better than the learner what to do next. Readiness (C8) informs the decision; it does not make it. |

---

## 8. How we'll know it works

No learners yet. So these are **thresholds to hit, not deadlines to meet**, and the numbers
are opening hypotheses to be calibrated against the first cohort — the *shape* of each
claim is the committed part, not its constant.

**Definitions.** An **active learner** is one who performed at least one capture, ask,
summary check, or practice run in the trailing 30 days. An **active course** is one
belonging to an active learner with at least one session captured. Both are counted from
behaviour, never from sign-in.

### 8.1 Riskiest assumptions, as falsifiable claims

Ordered by how much of the product dies if the claim is false.

| # | Claim | Answered by | Threshold |
|---|---|---|---|
| **A1** | **Capture survives past the point where habits die.** Learners keep adding sessions in week four and beyond, not in a panicked pre-exam batch. | Share of active courses with ≥1 session added in week *n* of the course | ≥50% still capturing in week 4, and ≥35% in week 6 |
| **A2** | **The payback loop repeats.** A learner who checks one summary comes back and checks another. | Share of learners with a 2nd summary check within 7 days of their 1st | ≥40% |
| **A3** | **Grounded answers get verified, not just read.** The citation changes behaviour. | Share of answers where the learner opens the cited source | ≥25% |
| **A4** | **Readiness changes what learners do next.** What it flags as thin is what they capture or practise next. | Share of readiness views followed within 48h by capture or practice on a flagged objective | ≥30% |
| **A5** | **A learner is affordable to serve.** | Model + storage spend per active learner per month | Inside the envelope in §11 |

A1 and A2 are existential. If either is false, no amount of work on the other seven
capabilities saves the product — and both are cheap to answer early, which is the whole
argument for building C9 in v1 rather than after.

### 8.2 Guardrails — must not degrade

- **Citation validity: 100%.** No surfaced answer cites a session outside the scope actually
  sent. This is I5, a hard invariant, not a target with a tolerance.
- **Material processing success rate.** A failed upload is a learner who concludes the
  product is broken. Failures must be visible to the operator before they are reported.
- **Time from capture to first payback.** If the response to effort stops being immediate,
  I2 is broken and A2 will follow it down.
- **Cost per active learner.** See §11.

### 8.3 Anti-metrics — explicitly not goals

Time in product. Session length. Daily actives for their own sake. Questions asked per
learner.

Each of these can be raised by making the product worse: answers that require more
follow-ups, feedback that is vaguer, material that is harder to find. **Optimizing for
engagement works directly against what this product is for.** A learner who captures a
session, checks a summary, and closes the tab in four minutes is the success case. This
paragraph exists so nobody has to re-argue it in a growth review.

---

## 9. Open questions

Named rather than buried. Each blocks something specific.

**9.1 — The semester assumption versus the channel-agnostic learner.** §2 commits to
"learners taking a structured course, anywhere." But A1's threshold is written as *"still
capturing in week four"*, which presumes a cohort moving through a term together. For a
self-paced online learner there is no week four. Either the metric needs a portable
restatement (sessions per active course over the learner's own elapsed span), or the
beachhead in §2 hardens into a v1 constraint and widening waits. *Blocks:* the exact
definition of A1 and A4 in C9. *Not blocking:* any capability in §6.

**9.2 — What is a "session" when nothing schedules one?** In a semester course a session is
a class that happened. Self-paced, the learner defines the boundary themselves, and if they
define it badly — one session for a whole module — scope (C6) becomes coarse, citations
become useless, and readiness becomes flat. Unresolved whether the product should shape
that boundary, and if so how without violating I1. *Blocks:* widening past the beachhead.

**9.3 — Monetization.** Deliberately absent from this document. Cost-to-serve is an
engineering constraint here (§11), never revenue. Needs its own document before any pricing
surface is designed. *Blocks:* nothing in v1.

**9.4 — Model class per capability.** Default is Flash-class; Pro-class is reserved for
grounded Q&A (C6) and explanation, and only after an eval shows Flash-class insufficient.
Which capabilities actually need Pro is unanswered, and it moves A5 materially. *Blocks:*
the A5 threshold in §11. *Resolved by:* an eval, not an argument.

**9.5 — The objectives cold start.** C8 needs objectives; C3 gets them best from a syllabus.
Many learners do not have a syllabus, or have one that lists topics rather than outcomes.
If most courses end up with no objectives or bad ones, readiness silently degrades to an
empty page and the learner never learns why the product feels thin. Unresolved: what C3
offers a learner with no syllabus, without writing their objectives for them (I1).
*Blocks:* whether C8 can be validated in the first cohort at all.

**9.6 — Extraction quality as a trust event.** C3 presents extracted objectives as a draft
to confirm. If extraction is poor, the learner's first interaction with the product's
intelligence is a bad one, before any payback has occurred. Unresolved whether a
low-confidence extraction should be shown at all. *Blocks:* nothing; informs C3's design.

---

## 10. Phases

Ordered, undated. Each phase exits on evidence, not on a date.

**P0 — Foundation.** C1, C2, C3, C4. A learner can register, return, create a course with
objectives, and capture sessions with material and their own account of them.
*Exit:* a learner can complete the loop from signup to a captured session on a phone, and
material processing is reliable enough that failures are the exception.
*Deliberately unrewarding.* Nothing here pays back yet, which is exactly why P1 follows
immediately and why P0 must not be extended.

**P1 — Payback.** C5, C6, C7. The first three things that return something for effort. C5
comes first within the phase: it is the most direct test of the thesis (§3, Claim 1) and it
answers A2.
*Exit:* A2 measurable and above threshold, and C6's citation validity at 100% under I5.

**P2 — Orientation.** C8. Requires objectives from C3 and evidence from P1, so it cannot
come earlier.
*Exit:* A4 measurable.

**P3 — Operator visibility.** C9.
*Sequencing note:* C9 is last in build order but its instrumentation is not deferrable —
the events A1–A5 depend on must be emitted from P0 onward, or the first cohort produces no
answers. Build the dashboard last; emit the events from the first commit.

**Deferred beyond v1.** The companion layer — notifications, prompting, streaks (§7). It is
deferred rather than cancelled because it is the obvious lever on A1, and it must stay
unavailable until A1 has been measured without it. Otherwise engagement mechanics mask
whether the payback in I2 is real, and the product ships on a false positive.

---

## 11. Constraints that shape the product

These are product constraints, not engineering trivia. `CLAUDE.md` holds the verified
detail; what follows is what each one *means* for scope.

**Cost per interaction is a product decision.** Flash-class model spend puts an active
learner in roughly the $1–2/month range. Any change that multiplies tokens per interaction
— longer scope windows, retries, multi-pass answers, an agent loop — is a business decision
wearing a technical costume and must be argued as one. This is the arithmetic behind A5.

**Document pages, not file sizes, drive cost.** A PDF is billed and tokenized roughly one
page per image. So a scope of "the whole course" is not merely slower than a scope of "three
sessions", it is dramatically more expensive. This is why scope in C6 is the learner's to
set and why cross-course questions are a non-goal (§7).

**File limits shape what capture can accept.** There are hard ceilings on file size and page
count. C4 must fail *legibly* at those boundaries — telling the learner what happened and
what to do — rather than accepting an upload that silently never becomes usable.

**The model will not cite supplied documents for us.** No usable native citation metadata
exists for arbitrary documents passed in context. I5 is therefore enforced entirely in our
own code, which is what turns citation accuracy from a hope into a checkable invariant.

**Semantic retrieval is held in reserve, not adopted.** A managed retrieval store is the
fallback if scope-constrained citation proves insufficient. Adopting it substitutes semantic
retrieval for the structural retrieval that is Claim 3, so it is a thesis-level decision
requiring an explicit call — not an optimization an engineer makes on a Tuesday.

---

## Appendix — Traceability

The reset in §0 was deliberate. Nothing is lost: each capability derives from an intent file
recoverable from git.

| Capability | Derived from | Recover with |
|---|---|---|
| C1 Register an account | `docs/intent/register-an-account.md` | `git show fe3c550:docs/intent/register-an-account.md` |
| C2 Sign in again | `docs/intent/sign-in-again.md` | `git show fe3c550:docs/intent/sign-in-again.md` |
| C3 Set up a course | `docs/intent/set-up-a-course.md` | `git show fe3c550:docs/intent/set-up-a-course.md` |
| C4 Capture a session | `docs/intent/capture-a-session.md` | `git show fe3c550:docs/intent/capture-a-session.md` |
| C5 Check my summary | `docs/intent/check-my-summary.md` | `git show fe3c550:docs/intent/check-my-summary.md` |
| C6 Ask my course | `docs/intent/ask-my-course.md` | `git show fe3c550:docs/intent/ask-my-course.md` |
| C7 Quiz me | `docs/intent/quiz-me.md` | `git show fe3c550:docs/intent/quiz-me.md` |
| C8 See my readiness | `docs/intent/see-my-readiness.md` | `git show fe3c550:docs/intent/see-my-readiness.md` |
| C9 Know it's working | `docs/intent/know-its-working.md` | `git show fe3c550:docs/intent/know-its-working.md` |

The nine technical specs at `docs/specs/` in the same commit were written before this
document existed. They are reference, not authority, and will be rewritten to trace to the
capabilities above.

UI mockups for every capability exist at `design/aitutor-ui/` in commit `fe3c550`.
