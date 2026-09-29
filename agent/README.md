# The material agent

An agent that answers a learner from **their own course material and nothing else**, deployed
to Vertex AI Agent Engine, reaching the material over MCP at `POST /api/mcp`.

```sh
uv venv --python 3.12 .venv && . .venv/bin/activate
uv pip install -r requirements.txt
python deploy.py            # creates or updates the engine, matched on display name
```

## Why this directory is Python

Agent Engine's runtime is Python. That is the only reason. ADR 0003 makes this a TypeScript
monorepo and this directory is the exception, so it holds an agent and nothing else — no
product logic, no types the API also needs, nothing that could drift out of step with
`packages/shared`. If something here starts to look like it belongs to the product, it does,
and it belongs on the other side of the MCP boundary.

## What it does not contain

No retrieval. The allow-list of what a learner may read, the cross-learner isolation
assertion and the exclusion of deleted material all live behind `/api/mcp`
([`readable.ts`](../apps/api/src/readable.ts), [`mcp.ts`](../apps/api/src/mcp.ts)). Putting
any of it here would create a second place those guarantees could be got wrong, and the
guarantee that tolerates zero failures — never answering from another learner's material — is
the last thing that should exist in two copies.

## Identity, and the one thing to understand before changing anything

`/api/mcp` decides whose material a request may read **from a token it verifies itself**. No
tool takes a learner id, and a test asserts none ever grows one. That is what makes an agent
runtime — this one, or any other — unable to ask for the wrong person's material rather than
merely discouraged from trying.

The consequence for this code: the MCP session is opened **per tool call**, not once when the
agent starts. The token belongs to whoever is asking now, so it cannot be baked into a
connection made at deploy time. One session per call is the price, and it is worth paying.

The token arrives in session state as `id_token`, with `course_id` beside it. Whatever drives
the agent is responsible for putting them there.

### The security cost, stated plainly

For the demo the credential passed in is the learner's **Firebase ID token** — a full-account
bearer credential, valid for about an hour, which now travels into the Agent Engine runtime
and may persist in its session state and traces. That is an accepted cost for a demo on the
team's own account. **It should not ship to real learners as it stands.** The fix is a
short-lived token minted by our API, scoped to MCP read access for one learner and expiring in
minutes, so a leak grants a search of one course rather than an account. That was a deliberate
decision, not an oversight.

## What it cannot do

It has no tool that deletes, renames, moves or writes, because the MCP server exposes none —
requirement `0013` decided that nothing may change a learner's material on their behalf yet,
and the server's write gate is built and tested ahead of the first tool that would need it.
If a write tool is ever added, it stops for the learner on every execution, with a grant bound
to that call's exact arguments. An agent cannot route around that; it is enforced server-side.

## What was learned the hard way

Written down because each cost a cycle, in the spirit of the comment block at the top of
[`rag.ts`](../apps/api/src/rag.ts):

- **`google-adk` does not pull in `mcp`.** The `[adk]` extra installs the toolset module,
  which then fails at import with `ModuleNotFoundError: No module named 'mcp'`. It is a
  separate requirement.
- **The MCP client exposes results snake_cased.** The wire format is `structuredContent` and
  `isError`; the Python client gives you `structured_content` and `is_error`. Reading only the
  wire spelling is a bug that does not announce itself — every call still succeeds, the
  structured passages are silently missed, and the agent quietly answers from the one-line
  summary instead. Caught by running the real client against the real route.
- **The client function is `streamable_http_client`**, not `streamablehttp_client`, and headers
  travel on an `httpx.AsyncClient` passed in rather than as an argument of their own. That is
  what makes per-call authentication possible at all.
- **Transport failures surface as an anyio task group error**, so the readable cause is one
  level in. Unwrapped in `_reason`, because "unhandled errors in a TaskGroup (1
  sub-exception)" is exactly the sort of string a model will read out to a learner.
