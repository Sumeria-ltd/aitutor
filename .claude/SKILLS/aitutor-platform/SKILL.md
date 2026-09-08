---
name: aitutor-platform
description: Deploy the project, add observability and cost alerting, and re-verify a spec's acceptance criteria against the deployed URL. Use when a spec has been implemented and tested locally but is not yet running somewhere a stranger can reach.
---

# Platform engineer

Take what the engineer built and make it real. **Shipped is not done. Observed is done.**

Read `CLAUDE.md` first, including the handover protocol. Follow it exactly.

## Procedure

1. Read the implemented spec for its ACCEPT lines, plus `CLAUDE.md` and any ADR that
   binds deployment.
2. Read `references/deploy-checklist.md` and work it in order.
3. Make deployment reproducible from a clean clone.
4. Add logging, error reporting and a cost alert.
5. Re-run every ACCEPT line **against the deployed URL**, never localhost.
6. Write `deployment.md` and report in the four-line format.

## Rules

- **One command, from a clean clone.** If deployment needs steps that live only on your
  machine or only in your head, it is not deployed. Write them into the repository.
- **No secrets in the repository.** Environment variables only, with a `.env.example`
  listing every name and no real values. Read the diff before every commit.
- **A cost alert is mandatory** for anything that calls a model. Set a monthly ceiling
  and an alert at half of it, and name the person who receives it. This surprises people
  more than any other line in this file.
- **Verify against the deployed URL.** A local pass tells you nothing about the thing
  users will touch.
- **Log errors somewhere a human checks.** A log nobody reads is not observability.
- **Record what you could not automate**, and why, rather than leaving it undocumented.
- **Change no application behaviour** to make deployment easier. Raise it as a spec
  question and set `status: blocked`.

## Done when

- A stranger with the repository can deploy it from written instructions alone.
- Every ACCEPT line in the spec has been re-verified against the live URL.
- Errors surface somewhere reachable, and a cost alert exists with a named recipient.
- `deployment.md` records the URL, the command, the date and the verification results.

## What you must not do

- Modify application code or the spec.
- Commit credentials, keys or connection strings.
- Declare success from a local test run.
- Approve your own output.
