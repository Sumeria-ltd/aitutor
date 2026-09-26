# Atlassian — where the chain lives

Since 2026-09-12 the artifact chain lives in Atlassian, not in this repository. **Confluence
holds knowledge; Jira holds work.** The repository holds code, tests, the role skills, and
the engineering notes that belong beside code (`docs/ci.md`, `docs/diagrams/`).

| | |
|---|---|
| Site | `https://sumerialtd.atlassian.net` |
| Confluence space | **`AI`** — "aitutor" — `/wiki/spaces/AI` |
| Jira project | **`AIT`** — "aitutor" — `/jira/software/projects/AIT` |
| MCP server | `atlassian` — tools named `mcp__atlassian__confluence_*` and `mcp__atlassian__jira_*` |

**If the Atlassian MCP is not connected, a role stops.** It says so, and does not fall back
to writing files. There is no file fallback: the pages are the artifacts.

## Connecting

The server is declared in [`.mcp.json`](../.mcp.json) at the repository root — project
scope, committed, no secrets — and enabled for everyone by `enabledMcpjsonServers` in
[`.claude/settings.json`](settings.json), which also pre-approves the `mcp__atlassian__*`
tools (the three delete tools stay behind a prompt). It runs `uvx mcp-atlassian`, so
[`uv`](https://docs.astral.sh/uv/) must be installed.

Credentials come from a git-ignored **`.env` at the repository root**, or from your shell
environment — whichever you prefer; an exported variable wins over `.env`:

```sh
ATLASSIAN_EMAIL=you@sumerialtd.co.uk
ATLASSIAN_API_TOKEN=…        # id.atlassian.com → Security → API tokens; one token serves Jira and Confluence
```

Claude Code itself cannot read `.env` — it expands `${VAR}` in `.mcp.json` from its own
environment only — so `.mcp.json` starts every server through `scripts/mcp-env.sh`, which
loads `.env` and then execs the real command. After editing `.env`, reconnect with `/mcp`
(or restart Claude Code); `atlassian` should show connected. The site URLs default to
`sumerialtd.atlassian.net`; set `JIRA_URL` / `CONFLUENCE_URL` only for another site.
`JIRA_PROJECTS_FILTER=AIT` and `CONFLUENCE_SPACES_FILTER=AI` scope searches to this project
by default; pass an explicit filter to a tool to look elsewhere.

A user-level definition of the same server in `~/.claude.json` (`claude mcp add … -s user`)
does **not** take precedence: Claude Code resolves local → project → user, so inside this
repository `.mcp.json` wins. If the two variables above are not exported, the server starts
with empty credentials and **fails quietly** — Confluence reads return 403, but Jira
searches return an empty list rather than an error, so a role could mistake "unauthenticated"
for "no issues".

**Every role therefore checks it is authenticated before doing anything else:**
`confluence_get_page(page_id="330039466")` (the space home) must return the page, not an
error. If it errors, stop and report that the Atlassian MCP is unauthenticated — the fix is
the two exports, not a retry.

## Confluence — the page tree

```
aitutor Home
├── Product
│   ├── PRD — AITutor                      the root document
│   └── Intents                            index → Intent NNNN · <title>   (one per requirement)
├── Architecture
│   ├── Architecture Overview              the diagrams; the architect keeps it current
│   ├── Decision log                       index → ADR NNNN · <decision>
│   └── Specs                              index → Spec NNNN · <title>     (one per intent, on request)
├── Delivery
│   ├── Workflow                           the chain and the handover rules
│   ├── Repository & CI                    docs/ci.md, rendered
│   ├── Roadmap
│   └── Deployment                         the deployment record (what deployment.md used to be)
└── Validation                             index → Validation NNNN · <title>
```

**Titles are the lookup key.** Every artifact page is titled `<Kind> NNNN · <Title>` where
`Kind` is `Intent`, `ADR`, `Spec` or `Validation` and `NNNN` is the four-digit ID. The
title after the `·` is the document's own H1 title. Find a page with
`confluence_get_page(title="Spec 0002 · …", space_key="AI")` when the exact title is known,
or `confluence_search(query='space = AI AND title ~ "Spec 0002"')` when it is not. The
index pages (`Intents`, `Decision log`, `Specs`, `Validation`) list every child with its
status; update the index row when you create or change a child.

Pages are written and read as **markdown** (`content_format: markdown`, the default). Read a
page with `confluence_get_page(page_id=…)`; it comes back as markdown with the header table
intact.

### The status header

Every artifact page begins with this table and nothing may precede it. It is the same
header the files used to carry, and the handover rules read it the same way.

```markdown
| | |
|---|---|
| **id** | 0003 |
| **status** | `draft` |
| **owner** | `aitutor-architect` |
| **inputs** | [PRD — AITutor](…), [Intent 0003 · Set up a course](…) |
| **updated** | 2026-09-12 |
```

`status` is one of `draft`, `ready-for-review`, `approved`, `blocked`, `superseded`.
`inputs` are links to the pages this artifact was produced from. When superseding, add a
row `| **superseded-by** | [link] |` to the old page.

**A human approves by editing the `status` cell to `approved`.** Nothing else counts.

### Labels

Every artifact page carries a kind label — `prd`, `intent`, `adr`, `spec`, `validation` —
and a `req-NNNN` label. Add them with `confluence_add_label`. They make
`label = req-0004` return everything about one requirement.

### Diagrams

Sources are Mermaid files in `docs/diagrams/*.mmd`, committed to the repository. Render
with `npx -y @mermaid-js/mermaid-cli@11 -i <file>.mmd -o <name>.png -b white -s 2 -w 1600`
(on a machine with Chrome, pass `-p` a puppeteer config whose `executablePath` points at
it), upload the PNG to the page with `confluence_upload_attachment`, and reference it in
the page body as `![…](<name>.png)`. Uploading a file with the same name replaces it.

## Jira — the work

| Type | One per | Summary | Labels | Parent |
|---|---|---|---|---|
| **Epic** | requirement | `NNNN · <Title>` | `req-NNNN`, `phase-P0…P3` | — |
| **Story** | countable acceptance criterion in PRD §5 | `NNNN · <the criterion as an outcome>` | `req-NNNN` | the epic |
| **Task** | chain step | `NNNN · Spec` / `NNNN · Implement` / `NNNN · Deploy` / `NNNN · Validate` | `req-NNNN`, `role-architect` / `role-engineer` / `role-platform` / `role-validator` | the epic |

Within an epic the tasks are linked `Spec` *blocks* `Implement` *blocks* `Deploy` *blocks*
`Validate`. Across epics, only what the PRD states: 0001 → 0002; 0002 and 0004 → 0007;
0003 → 0008; and 0004 → 0010 → 0005, 0006, 0007, 0008, because `0010` defines what every
requirement that reads a learner's material is permitted to read.

Find your task with `jira_search(jql='project = AIT AND summary ~ "0002 · Spec"')`.

### Statuses, and what a role does with them

The AIT workflow is `Backlog → Selected for Development → In Progress → Done`.

| Moment | Page header | Jira task |
|---|---|---|
| A role starts | `draft` | `In Progress` (transition it yourself) |
| A role finishes and its Done-when list is met | `ready-for-review` | stays `In Progress`; **comment** with the page link and the Done-when result |
| A role cannot finish | `blocked`, with a `## Blocked on` section | stays `In Progress`; add the label `blocked`; **comment** `Blocked on: …` |
| **A human approves** | `approved` | `Done` |
| A human rejects | back to `draft`, with their comment on the page | stays `In Progress` |

**A role never transitions its own task to `Done`.** Done is the human's act, and it
mirrors `approved` on the page — the page header is the gate the next role reads; the Jira
status is how the board stays honest.

The engineer's output is a pull request, not a page: its branch is `feat/AIT-<n>-<slug>`
and the PR title starts with `AIT-<n>`, so Jira's development panel shows it. The human
approves by merging; the task goes `Done` when the PR is merged.

The validator's findings on each acceptance-criterion story are comments with evidence;
the human moves a story to `Done` when they accept the evidence.

## The requirement map

| Req | Epic | Stories | Spec | Implement | Deploy | Validate | Intent page | Spec page |
|---|---|---|---|---|---|---|---|---|
| 0001 | AIT-1 | AIT-10…13 | AIT-42 | AIT-43 | AIT-44 | AIT-45 | 330334218 | 330596353 |
| 0002 | AIT-2 | AIT-14…16 | AIT-46 | AIT-47 | AIT-48 | AIT-49 | 330039625 | — |
| 0003 | AIT-3 | AIT-17…19 | AIT-50 | AIT-51 | AIT-52 | AIT-53 | 330465308 | — |
| 0004 | AIT-4 | AIT-20…23 | AIT-54 | AIT-55 | AIT-56 | AIT-57 | 330203159 | — |
| 0005 | AIT-5 | AIT-24…27 | AIT-58 | AIT-59 | AIT-60 | AIT-61 | 330203183 | — |
| 0006 | AIT-6 | AIT-28…31 | AIT-62 | AIT-63 | AIT-64 | AIT-65 | 330498049 | — |
| 0007 | AIT-7 | AIT-32…34 | AIT-66 | AIT-67 | AIT-68 | AIT-69 | 330530817 | — |
| 0008 | AIT-8 | AIT-35…37 | AIT-70 | AIT-71 | AIT-72 | AIT-73 | 330399769 | — |
| 0009 | AIT-9 | AIT-38…41 | AIT-74 | AIT-75 | AIT-76 | AIT-77 | 330563585 | — |
| 0010 | AIT-78 | AIT-79…82 | AIT-83 | AIT-84 | AIT-85 | AIT-86 | 339116033 | — |

Requirement `0010` — answer from my current material only — was added on 2026-09-25 at rank 5,
which moved `0005`–`0009` to ranks 6–10. Its journey is J7. Two issues under `AIT-78` are **not**
chain tasks and deliberately break the table above: **`AIT-87`** is a demo prototype of J7,
labelled `demo` with no `role-*` label, which needs no approved spec because it ships no product
behaviour; and `AIT-88` is a second story on `AIT-6` (not `AIT-78`) added when requirement
`0006`'s acceptance criteria were restated on 2026-09-26.

Page IDs are `https://sumerialtd.atlassian.net/wiki/spaces/AI/pages/<id>`.

| Page | ID | | Page | ID |
|---|---|---|---|---|
| aitutor Home | 330039466 | | Architecture Overview | 330268820 |
| Product | 330203138 | | Decision log | 330235908 |
| PRD — AITutor | 330465281 | | ADR 0001 … 0012 | 330268696, 330465332, 330203207, 330334242, 330432516, 330465362, 330596398, 330268730, 330563609, 330268760, 330039649, 330268788 |
| Intent 0010 | 339116033 | | ADR 0013, ADR 0014 | 339542019, 339804161 |
| Intents | 330268676 | | Specs | 330235928 |
| Architecture | 330301441 | | Delivery | 330366977 |
| Workflow | 330432548 | | Repository & CI | 330498073 |
| Roadmap | 330432575 | | Deployment | 330203233 |
| Validation | 330399745 | | | |

## Where the documents came from

The PRD, nine intents, twelve ADRs and spec 0001 were written in this repository under
`docs/` and moved to Confluence on 2026-09-12; each page's first paragraph names the
commit it was taken from. `git log -- docs/prd.md` and the others show the history up to
commit `96f96e2`. They are not kept in the working tree, so there is exactly one copy.
