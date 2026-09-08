# AITutor

A per-course study space for learners. A learner creates a course, declares its objectives,
and adds a session for each class as it happens — attaching material or writing a summary in
their own words. They can then question their own material and get answers cited back to the
session they came from.

What the product is and must do: [`docs/prd.md`](docs/prd.md).
How it is built — stack, constraints, architecture: [`CLAUDE.md`](CLAUDE.md).
Why each technical decision was made: [`docs/adr/`](docs/adr/).

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
workspaces (ADR 0004). It includes the document-invariant checks, so a malformed ADR or a
requirement whose id disagrees with its filename fails the suite like any other bug.

The GitHub Actions workflows call only `make build` and `make test` (ADR 0009). **Renaming a
target silently removes the merge gate** — change the bodies, never the names.

## Layout

```
packages/shared   types and logic both surfaces need; the route contract lives here
apps/api          the Cloud Run service — Hono, Firebase Admin
apps/web          the Firebase Hosting app — React, Vite
tests             repository-level checks that belong to no single workspace
docs              the requirement chain: prd, intents, adr, specs
scripts           the bodies behind the Make targets
```

`packages/shared` is consumed as TypeScript source through an npm workspace link, so there is
no build ordering to remember and no compiled artifact to go stale.

## How work reaches this repository

Every change traces to a four-digit requirement id, from `docs/prd.md` through its intent,
spec and validation record. The roles that produce those documents live in `.claude/SKILLS/`,
and the handover protocol they follow is in [`CLAUDE.md`](CLAUDE.md).

Nothing is committed directly to `main`: branch, open a pull request, and merge once the
checks are green (ADR 0010, ADR 0011).
