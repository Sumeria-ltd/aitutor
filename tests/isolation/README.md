# The isolation probe — ADR 0015

A **black-box adversary**. It speaks only HTTP to a running instance, holds two real
accounts, and **imports nothing from `apps/api` or `packages/shared`.** That prohibition is
not a convention: `tests/isolation-boundary.test.ts` fails the build if it is broken.

**It hard-codes the routes it attacks, and that is the point.** A probe that imported the
route table would follow a rename silently and keep passing. PRD §8's named failure is a
probe that survives a refactor of the thing it probes — a green light that has stopped
meaning anything, which is more dangerous than no light because it is believed.
**Brittleness against exactly that refactor is the mitigation.** When this goes red after a
rename, the right response is to ask whether the attack is still the right attack, not to
make the probe adaptive.

## Running it

    AITUTOR_BASE_URL=https://… \
    AITUTOR_PROBE_TOKEN_A=… AITUTOR_PROBE_TOKEN_B=… \
    npx vitest run tests/isolation

With no `AITUTOR_BASE_URL` the suite **skips**, and says so. That is deliberate: `make test`
runs on a developer machine with no deployed instance, and a probe that failed there would
be turned off within a week. It is `aitutor-platform` that must run it against the deployed
URL on every deploy and record the attestation — a deploy with no recorded attempt is a
failed deploy (ADR 0015), and a skip is not an attempt.

## What it attempts

The five attempts in ADR 0015's published floor. It is a floor: adding to it is a normal
act rather than an admission.

## Who judges it

Nobody declares it passed — the exit status is the verdict. `aitutor-validator` judges
whether the probe is still *adequate*, once per requirement, by attempting the leak by hand
without reading this directory first and reporting whether the probe would have caught what
they tried.
