# Continuous integration and delivery

Four workflows and one ruleset. Together they enforce that nothing reaches `main` except
through a pull request whose build and tests are green, that every commit which does reach
`main` is proven deployable and named, and that deploying it is a deliberate act by a person
with no credential stored anywhere.

```
push feature branch ──▶ Auto PR ─────▶ pull request to main
         │                  (blocked by org policy — see below)
         │
         └───────────▶ CI ──────────▶ build ✓  test ✓
                                          │
                        main ruleset ─────┘  no green, no merge
                                          │
                                    squash merge
                                          │
                                          ▼
                              Deployment ready ──▶ rc-YYYY.MM.DD-<sha>
                                                          │
                                        a person, Actions tab, "Run workflow"
                                                          │
                                                          ▼
                                      Deploy ──▶ make deploy ──▶ Cloud Run + Firebase Hosting
```

## The contract

Workflows never name a toolchain. They call `make build` and `make test`, and nothing else.

That indirection is the point. [ADR 0003](adr/0003-one-typescript-monorepo.md) fixes the
repository as a TypeScript monorepo and [ADR 0004](adr/0004-one-test-runner.md) fixes Vitest
as the single runner invoked by *one command at the repository root* — but the exact
frameworks and versions are pinned in spec 0001, which is not written yet. When it is, the
engineer replaces the **bodies** of those two Make targets and touches no YAML.

**Do not rename the targets.** `build` and `test` are the check names
`.github/rulesets/main.json` requires. Renaming one removes the merge gate, and nothing
anywhere reports an error when that happens.

Until the scaffold exists, the bodies check the only thing this repository contains: its
documents, against the invariants `CLAUDE.md` defines.

| Target | Today | After spec 0001 |
|---|---|---|
| `make build` | Every intent the PRD's traceability table names exists, and every intent that exists is named by it | Compile all three workspaces |
| `make test` | Frontmatter is present and legal, `status:` is one of the four allowed values, IDs are four digits, each ID matches its filename, and no two documents in a directory share an ID | The Vitest suite at the repository root |

These are real checks, not placeholders — see "Proving the gate bites" below. `make check`
runs both, which is exactly what a pull request runs.

## Why CI triggers on push, not on pull_request

A pull request opened by a workflow using the built-in `GITHUB_TOKEN` does **not** fire
`pull_request` workflows. That is GitHub's guard against a workflow triggering itself
forever, and it has a nasty consequence here: since `auto-pr.yml` opens pull requests that
way, a `pull_request` trigger would leave every auto-opened PR with no checks at all — and
the ruleset would then block it permanently.

The usual workaround is a personal access token with `repo` scope. This repository is
public, so we do not keep one.

Instead, CI triggers on `push`. Check runs attach to the head commit SHA, and a ruleset's
required status checks are evaluated against the pull request's head SHA, so a push-triggered
run satisfies the gate exactly as a `pull_request`-triggered one would — with no secret.

**Known limitation:** pull requests from forks produce no checks, and therefore cannot be
merged. It fails in the safe direction. If outside contributors ever matter, that needs a
`pull_request_target` workflow or a maintainer-triggered run, and its own decision record.

## The gate

`.github/rulesets/main.json` is the merge gate, and it is *not* read from the repository —
GitHub keeps rulesets in repository settings. Committing the file protects nothing on its
own. `make protect` is what makes the committed file the truth:

```
make protect      # create or update the ruleset from the JSON
make unprotect    # escape hatch: stop enforcing, without deleting
```

`scripts/apply-ruleset.sh --show`, `--enable` and `--delete` are also available.

What it enforces on `main`: a pull request is required, the `build` and `test` checks must
pass, the branch must be up to date with `main` first, squash is the only merge method, and
force-push and deletion are refused. `bypass_actors` is empty — nobody bypasses, including
repository admins. That is the literal reading of *nothing built directly in main*.

**Required approving reviews is 0, deliberately.** GitHub forbids approving your own pull
request. On a single-developer repository, requiring one approval deadlocks every pull
request permanently. The gate here is the checks, not a second person. Raise it the day a
second developer arrives.

### When CI itself is broken

`make unprotect` disables enforcement without deleting the ruleset, so you can merge the fix.
Re-enable it immediately afterwards:

```
make unprotect
# merge the fix
scripts/apply-ruleset.sh --enable
```

## After a merge to main

`deployment-ready.yml` answers one question: could this commit be deployed? It re-runs build
and tests on the merged commit, then checks that

- every setting in `.env.example` is declared with an empty value or an angle-bracket
  placeholder, and that `.env` itself is not tracked;
- nothing credential-shaped is committed — private key headers, service-account JSON, and
  the token formats used by Google, GitHub and OpenAI-style APIs;
- the Cloud Run container image builds;
- the container starts and answers on `$PORT` with no credential — an image that builds but
  exits on startup is the failure the build check cannot see, and it is what Cloud Run would
  report as a revision that never became ready.

On success it tags the commit `rc-YYYY.MM.DD-<short-sha>` and uploads `dist/` if it is not
empty.

**It deploys nothing.** No cloud provider is contacted and no credential is stored, which
matters because this repository is public. Deployment belongs to the platform-engineer role
per `CLAUDE.md`; what this produces is a named, verified commit for that role to deploy
instead of "whatever `main` happens to be right now".

Checks whose subject does not exist yet — no `.env.example`, no `Dockerfile` — report as
skipped and pass. They begin enforcing the moment the file appears, with nobody having to
remember to switch them on.

## Deploying

`deploy.yml` takes a commit to GCP: `apps/api` as a container to Cloud Run, `apps/web` to
Firebase Hosting, with Hosting rewriting `/api/**` to the Cloud Run service so the two share
one origin. It runs only when a person triggers it — **Actions → Deploy → Run workflow** —
from `main`, or from an `rc-*` tag that `deployment-ready.yml` produced. Anything else is
refused twice: by the workflow's first step, and by the identity provider in GCP, which only
exchanges tokens minted for `main` or an `rc-*` tag of this repository.

**No credential is stored.** The job asks GitHub for an OIDC token and Workload Identity
Federation exchanges it for a short-lived credential as the `github-deployer` service
account, whose roles are the deploy-only set. The four values the workflow reads —
`GOOGLE_CLOUD_PROJECT`, `GCP_REGION`, `GCP_WORKLOAD_IDENTITY_PROVIDER`,
`GCP_DEPLOYER_SERVICE_ACCOUNT` — are repository *variables*, because none is a secret.

Per ADR 0009 the workflow names no toolchain. It calls `make deploy`, whose body is
`scripts/deploy.sh` — the same command from a laptop:

```
GOOGLE_CLOUD_PROJECT=<project-id> make deploy
```

That script builds the image, pushes it to Artifact Registry tagged with the commit SHA,
deploys it to Cloud Run as the `aitutor-api` runtime service account, reads the Firebase web
config from the project (never from the repository — the secret scan treats a Firebase API
key in the tree as a leak), builds the web app with it, deploys Hosting, and smoke-checks
that `/api/me` answers `401` through the rewrite and `/` answers `200`. The smoke check is
not the acceptance criteria; those are re-run by hand against the live URL and recorded on
the `Deployment` page in Confluence.

The project itself is prepared once by `scripts/gcp-bootstrap.sh`, run by a project owner:
APIs, the Artifact Registry repository, the two service accounts and their roles, the
identity pool and provider, the Firebase link, web app, Hosting site and email-link sign-in,
the Firestore database (whose location is permanent), and the budget with its named
recipient. It is idempotent — re-run it to bring a project back in line — and it prints the
four variables above at the end.

## Proving the gate bites

Requirement 0001 states that a suite which passes against a broken project is worse than no
suite, because it is trusted. Both scripts were tested by breaking things on purpose and
confirming they go red: an illegal `status:` value, an ID that disagrees with its filename,
two documents sharing an ID, a missing `owner`, an intent the PRD names but which does not
exist, an intent that exists but which the PRD never names, a real value in `.env.example`,
and each of the five credential shapes.

One bug was found that way and fixed. Patterns beginning with a dash were being parsed by
`git grep` as command-line options; it exited 129, the error was swallowed, and the scan
reported success having searched nothing. Patterns are now introduced with `git grep -e`,
and a scan that cannot run fails loudly instead of passing quietly.

## Repository settings this depends on

**Allow GitHub Actions to create and approve pull requests** must be enabled, or
`auto-pr.yml` cannot open one — no token scope substitutes for it.

**As of 2026-09-08 the `Sumeria-ltd` organization vetoes this for every repository it
owns**, so auto-PR does not currently open anything. It detects that case, explains it in
the run summary, and exits green rather than failing with an error nobody can act on. The
branch is still pushed and CI still runs; only the pull request has to be raised by hand:

```
gh pr create --base main --head <branch> --fill
```

An organization owner can lift it in **Settings → Actions → General → Workflow
permissions** for the org, after which the repository-level setting also needs enabling:

```
gh api --method PUT repos/Sumeria-ltd/aitutor/actions/permissions/workflow \
  -F default_workflow_permissions=read -F can_approve_pull_request_reviews=true
```

That org policy applies to every repository in `Sumeria-ltd`, which is why it is not
something to flip casually. The alternative, if it must stay in place, is a fine-grained
personal access token scoped to this repository with `pull requests: write`, stored as a
repository secret and used in place of `GITHUB_TOKEN` in `auto-pr.yml` — a stored credential
in exchange for the convenience, which is a trade worth making deliberately or not at all.

Each workflow declares its own `permissions:` block, so the repository-wide default stays at
`read`.

## Files

| Path | What it is |
|---|---|
| `.github/workflows/ci.yml` | The `build` and `test` checks, on push to any branch but `main` |
| `.github/workflows/auto-pr.yml` | Opens a pull request to `main` on the first push of a branch |
| `.github/workflows/deployment-ready.yml` | Post-merge verification and release-candidate tagging |
| `.github/workflows/deploy.yml` | Manual, keyless deployment of `main` or an `rc-*` tag to GCP |
| `.github/rulesets/main.json` | The merge gate, as code |
| `scripts/apply-ruleset.sh` | Pushes that JSON into repository settings |
| `scripts/check-docs.sh` | The current bodies of `make build` and `make test` |
| `scripts/check-deployable.sh` | The deployment-readiness checks |
| `scripts/deploy.sh` | The body of `make deploy` |
| `scripts/gcp-bootstrap.sh` | One-time, idempotent preparation of the GCP project |
| `Dockerfile` | The Cloud Run image for `apps/api` |
| `firebase.json` | Hosting: serve `apps/web/dist`, rewrite `/api/**` to Cloud Run |
| `Makefile` | The contract the workflows call |
