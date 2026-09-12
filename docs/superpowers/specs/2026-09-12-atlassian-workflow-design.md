# Design — the chain moves to Atlassian

Date: 2026-09-12
Status: implemented in the same pull request as this document

Written under the brainstorming skill, which places design records here. **This is not a
chain artifact.** It records a workflow decision the user made, so a future session can see
why the repository looks the way it does.

## The decision

Since 2026-09-12 the artifact chain lives in Atlassian: **Confluence for knowledge, Jira for
work**, the repository for code. The five roles cooperate only through those two systems.

| | Before | After |
|---|---|---|
| PRD, intents, ADRs, specs, validation, deployment record | files under `docs/`, `deployment.md` | pages in the Confluence space `AI` |
| Work tracking | none — the status headers were the only state | Jira project `AIT`: one epic per requirement, one story per countable PRD acceptance criterion, four chain tasks per epic |
| The gate | a human sets a file's `status: approved` | a human sets the page's `status` cell to `approved` **and** moves the chain task to `Done` |
| `blocked` | file status | page status + a `blocked` label and comment on the task (the AIT workflow has no such state) |
| Traceability | the four-digit ID in every filename and header | the same ID in every page title, page label `req-NNNN`, and Jira label `req-NNNN` |
| Diagrams | none | six Mermaid sources in `docs/diagrams/`, rendered to PNG and attached to the Overview, Workflow and Repository & CI pages |
| Document invariants | `scripts/check-docs.sh` behind `tests/docs-invariants.test.ts` | retired — nothing under `docs/` to check; Confluence keeps every page version |

Two options were considered and rejected on the way here, both on 2026-09-12:

- **Repository stays authoritative; Confluence mirrors it.** Built first — 36 pages, each
  banner saying "the file is authoritative". Rejected the same afternoon when the user
  decided the roles should work only through Atlassian; a mirror invites drift and gives
  the roles two places to read.
- **Jira task status as the gate.** One click for the human, but Jira's four-status
  workflow has no `ready-for-review`, `blocked` or `superseded`; they would have become
  labels and comments, and the chain's own vocabulary would have been lost. The page header
  keeps it intact; `Done` mirrors `approved`.

## What was built

- Confluence space `AI`: 36 pages under Product / Architecture / Delivery / Validation, with
  index pages, labels, and the six diagrams as attachments. Page IDs are in
  `.claude/ATLASSIAN.md`.
- Jira project `AIT`: 9 epics, 32 stories, 36 tasks, 31 *blocks* links, statuses set to
  where the project actually is (0001 spec and implementation `Done`; 0001 deploy and 0002
  spec `Selected for Development`).
- This repository: `.claude/ATLASSIAN.md` (conventions and the ID map), `.claude/HANDOVER.md`
  rewritten for pages and tasks, the five skills and their templates rewritten to read and
  write Atlassian, `CLAUDE.md` updated, `docs/diagrams/*.mmd`, and `docs/prd.md`,
  `docs/intents/`, `docs/adr/`, `docs/specs/`, `scripts/check-docs.sh`,
  `tests/docs-invariants.test.ts` removed.

## What this changes about spec 0001

Spec 0001's SCOPE listed `tests/docs-invariants.test.ts` and its ACCEPT lines A1 and A2
counted the document checks as part of "the real suite". Removing that test is a deviation
from an approved spec, made by a workflow decision rather than by the architect. It is
recorded here and on the spec page rather than silently: the suite still runs everything
else the spec named, and the CI-contract test (A13) is untouched.

## Consequences

**We accept:** the roles now depend on an MCP connection; without it they stop rather than
fall back to files. The human's approval is two clicks (page cell and task) instead of one
edit. GitHub no longer renders the PRD or ADRs — the Confluence pages do.

**We gain:** one copy of every document, a board that shows where each requirement is, and
acceptance criteria that are trackable as stories with evidence comments from the validator.

**We will know it was wrong if:** roles keep needing information that only exists in the
repository and start writing it back into `docs/`, or if the page header and the Jira status
drift apart often enough that nobody trusts either.
