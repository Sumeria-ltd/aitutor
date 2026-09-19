# AITutor

A per-course study space for learners. A learner creates a course, declares its objectives,
and adds a session for each class as it happens — attaching material or writing a summary in
their own words. They can then question their own material and get answers cited back to the
session they came from.

What the product is and must do: the [PRD](https://sumerialtd.atlassian.net/wiki/spaces/AI/pages/330465281)
in the Confluence space `AI`.
How it is built — stack, constraints, architecture: [`CLAUDE.md`](CLAUDE.md) and the
[Architecture Overview](https://sumerialtd.atlassian.net/wiki/spaces/AI/pages/330268820).
Why each technical decision was made: the [Decision log](https://sumerialtd.atlassian.net/wiki/spaces/AI/pages/330235908).
Work in flight: Jira project [AIT](https://sumerialtd.atlassian.net/jira/software/projects/AIT/boards).

## Running it

You need **Node 24** and nothing else. `.nvmrc` pins it; `nvm use` will pick it up.

```sh
npm install
npm run dev
```

That is the whole thing. `npm run dev` starts the API on port 8080 and the web app on
port 5173; open <http://localhost:5173>.

Copy `.env.example` to `.env` and fill it in before signing in for real — the app loads
without it, but Firebase will reject the sign-in link.

## Checking it

```sh
make test    # the whole suite
make build   # typecheck every workspace and build the web app
make check   # both, which is what CI runs on a pull request
```

`make test` runs [Vitest](https://vitest.dev) once at the repository root across all three
workspaces (ADR 0004), plus the repository-level checks in `tests/` — including the one that
fails if the CI workflow ever stops installing dependencies or renames a job.

The GitHub Actions workflows call only `make build` and `make test` (ADR 0009). **Renaming a
target silently removes the merge gate** — change the bodies, never the names.

## Layout

```
packages/shared   types and logic both surfaces need; the route contract lives here
apps/api          the Cloud Run service — Hono, Firebase Admin
apps/web          the Firebase Hosting app — React, Vite
tests             repository-level checks that belong to no single workspace
docs              engineering notes that belong beside the code: ci.md, diagrams/
scripts           the bodies behind the Make targets
```

`packages/shared` is consumed as TypeScript source through an npm workspace link, so there is
no build ordering to remember and no compiled artifact to go stale.

## How work reaches this repository

Every change traces to a four-digit requirement id, from the PRD through its intent, spec
and validation record — all pages in the Confluence space `AI` — and to a Jira epic in `AIT`
whose tasks are the chain's steps. The roles that produce those pages live in
`.claude/SKILLS/`; the handover protocol they follow is in [`CLAUDE.md`](CLAUDE.md), and the
Atlassian conventions in [`.claude/ATLASSIAN.md`](.claude/ATLASSIAN.md).

Nothing is committed directly to `main`: branch, open a pull request, and merge once the
checks are green (ADR 0010, ADR 0011).
