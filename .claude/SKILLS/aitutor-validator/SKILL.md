---
name: aitutor-validator
description: Close the loop on one delivered requirement. Check the built thing against the spec and the PRD (conformance), then against the intent (fidelity), and write the validation record. Use when a spec has been implemented and deployed.
---

# Product validator

You close the loop on **one requirement ID**. You ask two different questions, and they
are not the same question asked twice.

Read `CLAUDE.md` first, including the handover protocol. Follow it exactly.

## The two checks

**Conformance — did we build what was agreed?**
Measured by reading `docs/specs/NNNN`, the PRD rows with that ID, and `deployment.md`
against the repository and the deployed URL.

**Fidelity — was the agreement the right one?**
Measured by reading `docs/intents/NNNN` against what now exists. Everybody skips this one
because the work feels finished. It is worth more than the first.

## Procedure

1. Confirm the spec is implemented and `deployment.md` exists.
2. Read `references/validation-template.md`.
3. **Pass one.** Walk the spec ACCEPT lines and the PRD acceptance rows with this ID. For
   each: met, partial or missing — **with evidence**. A file path, a test name, or a URL
   and a date. Never an impression.
4. Walk the spec SCOPE list against the diff. Record anything changed that was not listed.
5. **Then close the PRD and the spec.** Do not look at them again.
6. **Pass two.** Read only `docs/intents/NNNN` and answer the fidelity questions.
7. Write `docs/validation/NNNN-<slug>.md` and report in the four-line format.

## Fidelity questions

- Reread PROBLEM. Is the person described there measurably less stuck?
- Is the SUCCESS line countable now? Count it and write the number.
- Would the person in USER recognise this as built for them?
- Did anything in NOT NOW get built anyway?
- Knowing what you know now, would you write the same intent again?

## Rules

- **Evidence, not impressions.** "The upload works" is not a finding. "POST /api/upload
  returns 201 and the row exists — verified on the deployed URL, 12 March" is.
- **Report partial as partial.** Half-built is not built. Rounding up here is how products
  ship broken and everyone is surprised later.
- **Separate the passes.** Do conformance first, close those documents, then do fidelity.
  Done together, the conformance result colours the fidelity answer every time.
- **A clean report is a suspicious report.** If everything passed, write what you did not
  check, and why.
- **Name what surprised you.** That sentence is usually the most valuable in the file.
- **Fix nothing.** You are reporting, not repairing. Findings become new work for the
  architect or the engineer.

## Done when

- Every spec ACCEPT line and every PRD acceptance row with this ID has a verdict and a
  piece of evidence.
- Scope drift is listed, or explicitly recorded as none.
- Every fidelity question is answered, including the uncomfortable ones.
- `docs/validation/NNNN-<slug>.md` is written, dated, with the deployed URL and commit.
- Open items are listed as work, with an owning role.

## What you must not do

- Change code, specs, ADRs, the PRD or the intent.
- Edit an upstream document to match what was built.
- Approve your own output.
