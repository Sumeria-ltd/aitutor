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
0003 → 0008; 0004 → 0010 → 0005, 0006, 0007, 0008, because `0010` defines what every
requirement that reads a learner's material is permitted to read; and 0004 → 0011, 0004 → 0012,
0012 → 0005, because `0005` checks what the learner wrote and `0012` is where the writing happens.

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
| 0003 | AIT-3 | AIT-17…19, AIT-123, AIT-124 | AIT-50 | AIT-51 | AIT-52 | AIT-53 | 330465308 | — |
| 0004 | AIT-4 | AIT-20…23, AIT-89, AIT-90, AIT-116 | AIT-54 | AIT-55 | AIT-56 | AIT-57 | 330203159 | — |
| 0005 | AIT-5 | AIT-24…27 | AIT-58 | AIT-59 | AIT-60 | AIT-61 | 330203183 | — |
| 0006 | AIT-6 | AIT-28…31 | AIT-62 | AIT-63 | AIT-64 | AIT-65 | 330498049 | — |
| 0007 | AIT-7 | AIT-32…34 | AIT-66 | AIT-67 | AIT-68 | AIT-69 | 330530817 | — |
| 0008 | AIT-8 | AIT-35…37, AIT-122 | AIT-70 | AIT-71 | AIT-72 | AIT-73 | 330399769 | — |
| 0009 | AIT-9 | AIT-38…41 | AIT-74 | AIT-75 | AIT-76 | AIT-77 | 330563585 | — |
| 0010 | AIT-78 | AIT-79…82, AIT-119 | AIT-83 | AIT-84 | AIT-85 | AIT-86 | 339116033 | 342622210 |
| 0011 | AIT-97 | AIT-99…102, AIT-117, AIT-120, AIT-121 | AIT-108 | AIT-109 | AIT-110 | AIT-111 | 341639169 | — |
| 0012 | AIT-98 | AIT-103…107, AIT-118 | AIT-112 | AIT-113 | AIT-114 | AIT-115 | 341671937 | — |

Requirement `0010` — answer from my current material only — was added on 2026-09-25 at rank 5,
which moved `0005`–`0009` to ranks 6–10. Its journey is J7. Two issues under `AIT-78` are **not**
chain tasks and deliberately break the table above: **`AIT-87`** is a demo prototype of J7,
labelled `demo` with no `role-*` label, which needs no approved spec because it ships no product
behaviour; and `AIT-88` is a second story on `AIT-6` (not `AIT-78`) added when requirement
`0006`'s acceptance criteria were restated on 2026-09-26.

Requirements `0011` (plan the course schedule) and `0012` (keep my notes for a session) were added
on 2026-09-29 at ranks 6 and 7, moving `0005`–`0009` to 8–12. Their journeys are J8 and J9.
`0011` reverses a line of intent `0003`'s NOT NOW, which is why that page went back to
`ready-for-review` — and was then re-approved the same day.

**The approval pass of 2026-09-29.** The PRD and all twelve intents are `approved`. Five pages
had been waiting — `0003`, `0006`, `0010`, `0011`, `0012` — and were approved by the human,
instructed in session and recorded on their behalf; each carries an attribution line saying so,
because `aitutor-pm` may not approve its own work. Approval closed none of the open questions,
and the `Intents` index now names the four a downstream role will meet first: **PRD open question
12** (proving the cross-learner guarantee rather than asserting it, on `0010`, and the most
consequential one left anywhere in the chain), **PRD open question 20** (whether a passed, empty
session is a gap the product names, on `0011`), `0006`'s first question (what a learner sees when
an answer must be withheld for want of an attribution), and `0012`'s two spec-level ambiguities
(an unreadable photograph of handwriting, and one note reachable from two accounts).

**Four decisions of 2026-09-29 became work**, so the countable line lives on a story rather than
only in the PRD. **PRD open question 16** — may a course hold material of its own? — was decided
both ways in one sitting and settled as *out of scope for this phase*: `AIT-116` therefore says an
upload may start from the course screen and the learner is still asked which session it belongs
to, and `AIT-89` (never file a document for me) is untouched. **17** the learner's chosen order
beats the dates — `AIT-117`, zero reorders on their behalf. **18** the learner declares whose
words a note is — `AIT-118`, zero classified for them. **19** emphasis, headings and lists and
nothing else — `AIT-104` was rewritten: its "scope is open, settle it before building the toolbar"
framing is gone and it now also counts zero controls beyond those three, which narrows the
business's "all the font editing menu like MS Word" deliberately. `AIT-54`, `AIT-108` and
`AIT-112` each carry a comment naming what cleared and what remains.

**Four more decisions, later the same day — and four pages went back to `ready-for-review`
before being approved again.** Open questions 3, 9, 12 and 20 were answered. Three of the four
added *new countable promises* to PRD §5 rather than clarifying existing ones, and an approval
cannot reach forward over text that did not exist when it was given (handover rule 2), so the
PRD, `0003`, `0008`, `0010` and `0011` all went back for a human. **All five were then approved:
PRD v43, `0003` v7, `0008` v5, `0010` v5, `0011` v4.** `0006` and `0012` never left `approved`.
Six stories carry the new criteria:

| Q | Decision | Work |
|---|---|---|
| 12 | Isolation is proven by a **deliberate attempt on every release, recorded as having failed** — not only by fifty clean questions. It gates the deploy | `AIT-119` |
| 20 | A session whose scheduled time passed **with nothing in it is named in the schedule**; a class still to come is **never** a gap in readiness | `AIT-120`, `AIT-121`, `AIT-122` |
| 3 | A learner with no syllabus **writes their own objectives from worked examples**; extraction becomes the lucky path, not the main one | `AIT-123`, `AIT-124` |
| 9 | `0010` **keeps rank 5** as a requirement of its own rather than becoming a constraint on the features it qualifies | none — no text changed |

Three of these are worth understanding rather than just recording. **`AIT-119` is the only story
in this project that asks for work to be done *against* the product**, and the only place the
chain commits to evidence rather than to a count: fifty clean answers can only report that nothing
went wrong while someone was watching. Its own failure mode, in PRD §8, is worse than a leak — a
probe that keeps passing after the thing it probes was rewritten, still forging an identifier the
system stopped using, because a green light is believed. **`AIT-121` counts a sentence, not a
behaviour**, which looks like a category error and is not: `AIT-120` can be built perfectly and
still turn the schedule into a ledger of failure, so the wording is what decides whether the
feature helps. And **`AIT-124`'s "zero objectives written for the learner" is the half most likely
to be improved away** — generating them from the course title or the captured material is the
product doing the comprehension, which the first product invariant forbids.

`0008` was the one `approved` page that had to be reopened; its rank was corrected from 8 to 11
while it was open. `AIT-50`, `AIT-54`, `AIT-70`, `AIT-83`, `AIT-85`, `AIT-108` and `AIT-112` carry
comments saying what changed, what cleared, and — on `AIT-83` and `AIT-85` — the question answering
12 created: **who runs the isolation attempt, and who may declare that it passed.** If the role
that builds the boundary also writes the probe and judges the result, the evidence is
self-certified, and it was **approved into Intent 0010 unanswered on purpose** because it is the
one thing that could make the answer to question 12 hollow.

**Where this leaves the chain.** The PRD and all twelve intents are `approved`, which means every
`NNNN · Spec` task is unblocked by handover rule 1 for the first time in the project's life —
`AIT-50`, `AIT-54`, `AIT-70`, `AIT-83`, `AIT-108` and `AIT-112` all say so. Two ordering facts
worth carrying: `0008`'s spec **depends on `0011`**, because readiness cannot tell *behind* from
*not yet* without the schedule; and `0010`'s spec has to settle who owns the isolation attempt
before its own "Done when" can be met. Approval closed four questions and left the rest standing —
the `Intents` index names the ones a downstream role meets first, and none of them is a number
anyone can look up.

**Architecture, 2026-09-29.** `aitutor-architect` ran on `AIT-83`. **[Spec 0010](https://sumerialtd.atlassian.net/wiki/spaces/AI/pages/342622210) is `ready-for-review`** — written in full, `blocked` for about fifteen minutes, released when the ADRs were approved. The run's real work was clearing the ADRs: **0013 and 0014 had eleven blockers between them and every one is now settled**, seven by the PM in PRD v43. Both are `ready-for-review`, each keeping its blocker list with what cleared it.

Two of those answers changed a record rather than releasing it. **ADR 0014 was revised**: its refusal to widen scope — the one place it declined the direction it was given — is replaced by a **two-phase loop with the learner's consent in the middle**, because PRD open question 14 decided the product asks first. Bounds are set as opening hypotheses: 3 steps, 12,000 retrieved tokens, 15 s. And **[ADR 0015](https://sumerialtd.atlassian.net/wiki/spaces/AI/pages/342392834) is new**, answering the question Intent 0010 was approved with deliberately unanswered — isolation is proven by a **black-box adversary** that imports nothing from `apps/api` or `packages/shared`, written by the engineer, run by CI and by `aitutor-platform` at deploy, and **judged by `aitutor-validator`**, which owns no code. Nobody declares it passed; the exit status is the verdict. The probe **hard-codes the surface it attacks** so that a rename breaks it — that is the mitigation for PRD §8's stale-probe risk, not an oversight.

**All three were approved on 2026-09-29**, in the order 0013 → 0014 → 0015, each carrying the human-attribution line. **[ADR 0001](https://sumerialtd.atlassian.net/wiki/spaces/AI/pages/330268696) and [ADR 0007](https://sumerialtd.atlassian.net/wiki/spaces/AI/pages/330596398) are now `superseded`** and kept in full, each with a note on why it is still worth reading: 0001 pre-registered its own reversal trigger — *"learners routinely select a scope that does not contain their answer"* — and **that trigger was never observed**, because there are no learners; and 0007's objection was **re-premised, not refuted**. Both were approved knowing this. The reversal that began as a business decision on 2026-09-26 is complete, and it went through the mechanism rather than around it.

**[ADR 0016](https://sumerialtd.atlassian.net/wiki/spaces/AI/pages/342196226) is new and `ready-for-review`** — the one signature still outstanding. Scope is an **allow-list of the `ragFile` ids the learner holds**, not a chunk-metadata filter. It **refines one clause** of 0013 rather than superseding it, because rewriting an approved record to change a sentence withdraws approval over a clause nobody disagreed with. Two reasons beyond the design argument: a metadata predicate must be right on every path forever, which is the shape ADR 0006 rejected for the data layer; and **we never established that the import path we use accepts our metadata** — the 2026-09-26 spike did not demonstrate it.

**The `Architecture Overview` is now current.** All four diagrams in `docs/diagrams/` were rewritten for the approved ADRs, re-rendered and re-attached, and every load-bearing paragraph of the page was replaced — it had still been saying *"structure replaces retrieval"*, *"deliberately no vector database"* and *"RAG Engine … deliberately unused"*. The `ask-my-course` diagram now shows the two-phase consent loop, and **fences off the citation step with a note saying no approved ADR decides it.**

**Two tooling facts, so nobody loses the time again.** Replacing an existing Confluence attachment **fails on this instance** — 415 on the replace path, and the originals are stored as `application/octet-stream`; upload under a new filename and repoint the page. And `mermaid-cli` needs `-p` with a puppeteer config carrying an `executablePath` to a local Chrome, or the launch fails outright.

**The bottleneck has moved, and it is no longer 0010.** [ADR 0002](https://sumerialtd.atlassian.net/wiki/spaces/AI/pages/330465332) — citation validity checked against the scope the product *sent* — was never superseded when retrieval stopped being a scope query. **Four specs cannot be completed without its successor**: 0005, 0006, 0007 and 0008. `attribute()` in the deployed chat route is running on a superseded decision today. It binds requirement 0006, so by the rules it is written when `0006 · Spec` is requested — it should not wait that long.

**Written 2026-09-29, and it is the last architecture record the chain is waiting on.** `aitutor-architect` wrote **[ADR 0017](https://sumerialtd.atlassian.net/wiki/spaces/AI/pages/341573661)** rather than waiting for `0006 · Spec` to be requested, because ADR 0002 being `approved` *and* unperformable is the worst state a record can be in. It is `ready-for-review`; approving it moves 0002 to `superseded` and **unblocks 0005, 0006, 0007 and 0008 at once**. **[ADR 0016](https://sumerialtd.atlassian.net/wiki/spaces/AI/pages/342196226) was approved the same day**, which clears Spec 0010's last dependency — a human's signature on the spec is now the only thing between it and `AIT-84`.

**ADR 0017 is not a formalisation of what is deployed.** ADR 0002 told the model the session identifiers and then checked them, which fails *silently* when an invented identifier happens to land inside the sent set. 0017 labels chunks by **opaque position** and never tells the model a session exists, so an out-of-set citation is **unrepresentable rather than detectable** — a returned label is either an index into an array we built or it is nothing. Its cost is stated plainly on the page: the model cannot name a session in its prose, so answers read more clinically than one that could say *"as your week three slides put it"*.

**And a thing that only became visible while writing it.** The honest reading of the retrieval reversal used to be that we traded an enforceable scope boundary for better recall. **We did not, in the end.** ADR 0016's allow-list means material outside the learner's chosen sessions is not retrievable at all, so the boundary is structural again — it moved from *what we chose to send* to *what we allow to be retrieved*, one layer earlier. The citation check reports; it no longer holds the line. That was recorded back onto ADR 0016 as well as into 0017.

**Spec 0010 names six places the phase D demo code does not meet requirement 0010**, the demo having been built without an approved spec at the business's direction. The one worth knowing here: **`deleteSession` and `deleteCourse` remove the material from answers but leave the bytes in the bucket and the chunks in the corpus.** The acceptance line is about answers, so it passes; the promise a learner hears is about existence. It would have shipped green.

**Two more sets of issues sit outside the chain**, and neither appears in the table above.
`AIT-91` is the phase D customer demo epic, labelled `demo` and `phase-D`, with stories
`AIT-92`–`AIT-96`; it is a delivery vehicle rather than a requirement and discharges none. And
`AIT-87`, the J7 design prototype, was superseded by it on 2026-09-26 — a human should close it.

Page IDs are `https://sumerialtd.atlassian.net/wiki/spaces/AI/pages/<id>`.

| Page | ID | | Page | ID |
|---|---|---|---|---|
| aitutor Home | 330039466 | | Architecture Overview | 330268820 |
| Product | 330203138 | | Decision log | 330235908 |
| PRD — AITutor | 330465281 | | ADR 0001 … 0012 | 330268696, 330465332, 330203207, 330334242, 330432516, 330465362, 330596398, 330268730, 330563609, 330268760, 330039649, 330268788 |
| Intent 0010 | 339116033 | | ADR 0013, 0014, 0015 | 339542019, 339804161, 342392834 |
| ADR 0016, ADR 0017 | 342196226, 341573661 | | | |
| Spec 0010 | 342622210 | | | |
| Intent 0011 | 341639169 | | Intent 0012 | 341671937 |
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
