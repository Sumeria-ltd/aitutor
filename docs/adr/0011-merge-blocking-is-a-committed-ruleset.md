---
id: 0011
status: ready-for-review
owner: aitutor-architect
inputs: [docs/prd.md, docs/adr/0010-ci-triggers-on-push.md, docs/superpowers/specs/2026-09-08-github-actions-cicd-design.md]
updated: 2026-09-08
---

# ADR 0011 — Merge blocking is a committed ruleset, applied by script

Promoted from the CI design record at
`docs/superpowers/specs/2026-09-08-github-actions-cicd-design.md`, now `superseded`.

## Context

The requirement is that nothing reaches the default branch without passing checks. How that
rule is expressed determines whether it can be reviewed, whether it can drift silently, and
whether anyone can tell what it says without holding an administrator account.

## Decision

The rule lives at `.github/rulesets/main.json` and is applied by
`scripts/apply-ruleset.sh`. The file is reviewable and diffable; the script is what makes it
true, since the platform does not read rulesets out of a repository. Committing the file alone
protects nothing, and the script exists so that fact is impossible to forget.

Required approving reviews is **zero**. Self-approval is forbidden by the platform, so on a
single-developer repository requiring one review would deadlock every pull request
permanently. The gate is the checks, not the reviews. `bypass_actors` is empty, including for
administrators — the literal reading of "nothing built directly in main" — and `make unprotect`
is the documented escape hatch for when the pipeline itself is what broke.

## Rejected options

### Configure branch protection through the settings page

It cannot be reviewed, diffed, or restored. Nobody without administrator access can see what
the rule currently says, and a change leaves no trace that a reader of the repository would
ever encounter.

### Require one approving review in addition to checks

On a repository with one developer this blocks every pull request forever, because the
platform will not let an author approve their own work. It would be a rule that reads as
rigour and functions as a deadlock, and the predictable response is to disable the whole
ruleset rather than that one clause.

## Consequences

**We accept:** the committed file is not self-enforcing. Someone must run the script after
changing it, and a repository whose file and live ruleset disagree looks protected while being
whatever was last applied. Reviews are also not a gate here, so a second pair of eyes is a
convention rather than a control — which is the right trade at one developer and the wrong one
at three.

**We gain:** the merge rule is readable, reviewable and restorable by anyone with the
repository, and no unreviewed commit reaches the default branch.

**We will know it was wrong if:** the default branch receives a commit whose checks did not
pass — or the committed file and the live ruleset drift apart without anyone noticing.

## Binds

| Requirement ID | How this constrains it |
|---|---|
| 0001–0009 | Every requirement reaches the default branch through a pull request with green checks; none is committed directly |
