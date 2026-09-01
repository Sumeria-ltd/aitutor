# Know it's working

## PROBLEM

AITutor is live with a cohort of students, and the person running it cannot answer the only question that matters: is it working?

Not whether the servers are up — whether students are doing the thing the entire product depends on. Are sessions still being captured in week five, or did capture quietly die in week three the way it dies in every note-taking product ever built? Does a student who checks one summary come back and check a second? Are the answers students receive actually cited correctly, or are some of them confidently wrong in a way nobody has noticed?

The operational failures are invisible too. A student's slide deck failed to process, so they concluded the product is broken and stopped opening it. Another is generating far more cost to serve than any realistic subscription would cover. A third wrote in to say an answer was wrong, and there is no way to see what happened without asking them to reconstruct it from memory.

Without this, every decision about what to build next is a guess, a quiet week is indistinguishable from a broken product, and support means asking students to debug on your behalf.

## USER

The person running AITutor, during the first cohorts — when there are tens or hundreds of students and every single one of them matters.

## OUTCOME

The operator can see whether the core loop is holding, and can help a stuck student without asking that student to explain their own bug.

Specifically: whether capture survives past the weeks where habits die, whether the effort-and-feedback loop is being repeated rather than tried once, where material is failing to process, and what a student costs to serve. Enough to tell a real problem from a quiet week — and, when something breaks, to know which assumption it was.

## SUCCESS

- The product's riskiest assumptions get answered with real behaviour instead of argued about. Capture surviving past week three, and repeat use of summary checking, are the two that decide whether this product works at all.
- Failures are noticed by the operator before a student reports them.
- A support question can be answered without asking the student to reproduce anything.
- Cost per student is known, and a student whose usage is running away is visible well before the bill arrives.

## LIMITS

- This must not break the privacy the product promises students. The operator sees behaviour and operations — that a capture happened, that a document failed to process, what it cost to serve — never content. What a student wrote in a summary, and what their lecture slides say, are not the operator's to read.
- Where a support case genuinely cannot be resolved without seeing content, it requires that student's explicit consent for that case, and the access is recorded.
- Aggregate answers are preferred to individual ones. The question is nearly always "is this working across the cohort", not "what is this particular person doing".
- It measures behaviour that indicates learning, not engagement for its own sake. Time spent in the product is not a goal, and optimizing for it would actively work against what the product is for.
- It is an operator's instrument at small scale. It is not a product surface, and nothing in it is seen by students, instructors, or institutions.

## NOT NOW

- Any instructor-facing or institution-facing reporting
- Billing, subscription, or payment administration
- Content moderation tooling and review queues
- Editing a student's material or acting from inside their account
- Staff roles, permissions, or multiple operator accounts
- Experimentation or A/B testing infrastructure
