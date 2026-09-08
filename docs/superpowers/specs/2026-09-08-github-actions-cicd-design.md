# Design — CI and CD on GitHub Actions

Date: 2026-09-08
Status: implemented on branch `ci/github-actions-pipeline`

Written under the brainstorming skill, which places design records here. **This is not an
ADR.** ADRs are owned by `aitutor-architect` per `CLAUDE.md`, and this was produced outside
that role. If the architect agrees with what follows, it should be promoted to
`docs/adr/0008-*` and this file superseded.

## Context

The request: feature branches only, a pull request opened automatically when one is pushed,
that pull request gated on the code building and the tests passing, merges blocked unless
both are green, and a deployment-readiness check after merge to `main`.

Two facts about the repository at the time shaped every decision.

**There is no code.** No `package.json`, no build command, no test command. The two things
the gate is meant to check did not exist. `docs/intents/0001-scaffold-the-repository.md`
even lists continuous integration under `NOT NOW`, so this work runs ahead of the pipeline
`CLAUDE.md` defines.

**The repository is public.** That removes credentials from the design space. Anything
requiring a personal access token or a cloud service account was rejected on that basis
alone.

During implementation the architect landed ADRs 0001–0007, including 0003 (one TypeScript
monorepo) and 0004 (Vitest, one command at the repository root). The toolchain question is
therefore now answered, but the scaffold implementing it does not exist yet, so the design
below is unchanged — and ADR 0004's demand for *one root command* is precisely the seam this
design already used.

## Decisions

### 1. Workflows call a Make contract, never a toolchain

`make build` and `make test`. The workflows name no language, package manager or runner.

The alternative — writing `pnpm install && pnpm build && pnpm test` into the YAML — would
have pre-empted an architecture decision that belongs in an ADR, and would need editing
again the first time the toolchain moved. The contract survives that; the YAML never changes.

Since ADR 0004 requires one test command at the repository root, `make test` is a faithful
expression of it rather than a competing one.

**Rejected: gate on the real toolchain now.** It required deciding the stack inside a CI
task. The architect has since decided it properly, in ADRs, which is the correct outcome.

**Rejected: no gate until the scaffold lands.** Weeks of unguarded merges, and a habit that
would have to be broken later.

### 2. The contract ships with real bodies, not placeholders

The bodies check the document invariants `CLAUDE.md` defines: legal `status:` values, four-
digit IDs, IDs matching filenames, IDs unique within a directory, and the PRD's traceability
table agreeing in both directions with the files on disk.

This was a correction made during design. The original plan left the targets failing until
the scaffold arrived — "honestly red". But the active work in this repository is documents,
so a red gate would have blocked every PM and architect pull request indefinitely, including
the one adding CI. The pipeline would have been dead on arrival.

Document checks are not a stand-in for a test suite. They are, however, real: they go red
when a document genuinely breaks, which was verified by breaking eight things on purpose.

### 3. CI triggers on push, not pull_request

A pull request opened with the built-in `GITHUB_TOKEN` does not fire `pull_request`
workflows. Since the auto-PR workflow opens pull requests that way, a `pull_request` trigger
would produce pull requests with no checks, which the ruleset would then block forever.

Required status checks are evaluated against the pull request's head SHA, and check runs
attach to that SHA regardless of which event produced them, so a push-triggered run
satisfies the gate.

**Rejected: a personal access token.** A long-lived credential in a public repository, to
work around a guard that exists for good reason.

**Accepted cost:** fork pull requests get no checks and cannot merge. It fails safe, and is
documented.

**Discovered on implementation:** the `Sumeria-ltd` organization forbids Actions from
creating pull requests in any repository it owns, which no repository-level setting or token
scope overrides. The workflow therefore detects that case, explains it in the run summary and
exits green, so the branch still gets its checks and only the pull request itself is manual.
Lifting it is an organization-wide policy change and belongs to an org owner making it
deliberately; the narrower alternative is a fine-grained token scoped to this one repository.

### 4. Merge blocking is a committed ruleset, not settings-page clicks

`.github/rulesets/main.json`, applied by `scripts/apply-ruleset.sh`. GitHub does not read
rulesets from the repository, so the script is what makes the file true; committing it alone
protects nothing. The file is reviewable and diffable, which a settings page is not.

Required approving reviews is **0**. GitHub forbids self-approval, so on a single-developer
repository requiring one would deadlock every pull request permanently. The gate is the
checks.

`bypass_actors` is empty, including for admins — the literal reading of "nothing built
directly in main". `make unprotect` is the documented escape hatch for when CI itself breaks.

### 5. Post-merge proves deployability and names a candidate; it deploys nothing

Re-runs build and tests on the merged commit, verifies configuration is declared without
being leaked, scans for committed credentials, builds the container image, then tags
`rc-YYYY.MM.DD-<short-sha>`.

No cloud provider is contacted and no credential is stored. Deployment belongs to the
platform-engineer role. This hands that role a named, verified commit instead of "whatever
`main` is now".

Checks whose subject does not exist yet report as skipped and pass, and begin enforcing the
moment the file appears — so nobody has to remember to switch them on.

## Consequences

**We accept:** the gate currently proves documents are well-formed, not that software works.
That is the strongest available claim until spec 0001 is built, and the checks must be
swapped rather than merely extended when it is. The Make target names are load-bearing in a
way nothing enforces — renaming one silently removes the gate, which is why it is warned
about in three places.

**We gain:** no unreviewed commit reaches `main`, no secret exists to leak, and the toolchain
decision stayed with the architect.

**We will know it was wrong if:** a pull request merges with a failing suite, or the gate
blocks work it should not and gets disabled and left off.

## Verification

Both scripts were tested by breaking things deliberately: an illegal status value, an ID
disagreeing with its filename, two documents sharing an ID, a missing owner, an intent named
by the PRD but absent, an intent present but unnamed, a real value in `.env.example`, and
five credential shapes. All went red; the tree went green again on restore.

One genuine bug was found and fixed. `git grep` was parsing patterns that begin with a dash
as command-line options, exiting 129, and the error was being swallowed — the secret scan
reported success having searched nothing. Patterns are now passed with `-e`, and a scan that
cannot run fails loudly. This is exactly the failure mode ADR 0004 and requirement 0001 name:
a check that passes against a broken subject is worse than no check, because it is trusted.
