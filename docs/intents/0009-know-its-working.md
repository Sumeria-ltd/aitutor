---
id: 0009
status: approved
owner: aitutor-pm
inputs: [docs/prd.md]
updated: 2026-09-08
---

# Intent 0009 — Know it's working

Derived from PRD requirement 0009, rank 9.

PROBLEM:  AITutor is live with a cohort of learners, and the person running it cannot answer
          the only question that matters: is it working?
          Not whether the servers are up — whether learners are doing the thing the entire
          product depends on. Are sessions still being captured in week five, or did capture
          quietly die in week three the way it dies in every note-taking product ever built?
          Does a learner who checks one summary come back and check a second? Are the answers
          learners receive actually attributed correctly, or are some of them confidently wrong
          in a way nobody has noticed?
          The operational failures are invisible too. A learner's material failed to process,
          so they concluded the product is broken and stopped opening it. Another is generating
          far more cost to serve than any realistic subscription would cover. A third wrote in
          to say an answer was wrong, and there is no way to see what happened without asking
          them to reconstruct it from memory. Without this, every decision about what to build
          next is a guess, a quiet week is indistinguishable from a broken product, and support
          means asking learners to debug on your behalf.

USER:     The person running AITutor, during the first cohorts — when there are tens or
          hundreds of learners and every single one of them matters.

OUTCOME:  The operator can see whether the core loop is holding, and can help a stuck learner
          without asking that learner to explain their own bug. Specifically: whether capture
          survives past the weeks where habits die, whether the effort-and-feedback loop is
          being repeated rather than tried once, where material is failing to process, and what
          a learner costs to serve. Enough to tell a real problem from a quiet week — and, when
          something breaks, to know which assumption it was.

SUCCESS:  Within one week of this existing, the operator answers four questions from the view
          alone, each inside five minutes: what share of active courses added a session this
          week; how many learners checked a second summary; which material failed to process
          and for whom; what one learner cost to serve last month. Count the places anywhere in
          the view where a learner's own words or the contents of their material are readable:
          zero.

LIMITS:   This must not break the privacy the product promises learners. The operator sees
          behaviour and operations — that a capture happened, that material failed to process,
          what it cost to serve — never content. What a learner wrote in a summary, and what
          their material says, are not the operator's to read. Where a support case genuinely
          cannot be resolved without seeing content, it requires that learner's explicit
          consent for that case, and the access is recorded. Aggregate answers are preferred to
          individual ones: the question is nearly always "is this working across the cohort".
          It measures behaviour that indicates learning, not engagement for its own sake — time
          spent in the product is not a goal, and optimizing for it would actively work against
          what the product is for. It is an operator's instrument at small scale, not a product
          surface, and nothing in it is seen by learners, instructors, or institutions.

NOT NOW:  Any instructor-facing or institution-facing reporting. Billing, subscription, or
          payment administration. Content moderation tooling and review queues. Editing a
          learner's material or acting from inside their account. Staff roles, permissions, or
          multiple operator accounts. Experimentation or A/B testing infrastructure.

## Open questions
- This is ranked last to build, but the measurements it reports have to be recorded from 0001
  onward or the first cohort produces no answers. Does that recording belong to each earlier
  requirement as it ships, or to a separate slice ahead of them? It changes what 0001 through
  0008 are each responsible for.
- Below roughly twenty learners every share is noise. What does the operator actually look at
  in week one, when the cohort is too small for any percentage to mean anything? PRD open
  question 8.
- Who is the operator, concretely — one named person or a rotating role? It changes what the
  consent record has to capture. PRD open question 7.
- Cost to serve one learner has to be attributable to that learner to be useful, but attributing
  cost per learner is itself a form of per-learner tracking. Where is the line against the
  privacy promise?
