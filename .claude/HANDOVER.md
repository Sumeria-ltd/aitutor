<!-- Paste this section into your project's CLAUDE.md, unchanged. -->

## Artifact chain and handover protocol

This project is built by a chain of roles. Each role reads pages, writes pages, moves its
Jira task, and stops. **No role calls another role.** The artifact is the interface.

Knowledge lives in the Confluence space `AI`; work lives in the Jira project `AIT`; the
code lives in this repository. `.claude/ATLASSIAN.md` holds the page tree, the title and
label conventions, the Jira conventions and the ID map. Every role reads it before
starting. **If the Atlassian MCP is not connected, stop and say so** — there is no file
fallback.

### The chain

```
problem.txt (the brief)
   └─ aitutor-pm        → Confluence: PRD — AITutor
                        → Confluence: Intent NNNN · <title>          (one per requirement)
                        → Jira: the epic, its stories, its four chain tasks
      └─ aitutor-architect → Confluence: ADR NNNN · <decision>       (decisions, product-wide)
                           → Confluence: Spec NNNN · <title>         (one per intent, on request)
                           → Confluence: Architecture Overview       (kept current)
         └─ aitutor-engineer   → this repository: code and tests, one pull request per spec
            └─ aitutor-platform → Confluence: Deployment, and the live URL
               └─ aitutor-validator → Confluence: Validation NNNN · <title>
```

The PRD page is the root document. Every requirement in it has an ID. That ID travels:
requirement `0003` becomes intent `0003`, spec `0003`, validation `0003`, epic
`0003 · <title>`. Anything without a traceable ID does not belong in this project.

### Every artifact page carries a status header

Every artifact page begins with this table, and nothing may precede it:

```markdown
| | |
|---|---|
| **id** | 0003 |
| **status** | `draft` |                    draft | ready-for-review | approved | blocked | superseded
| **owner** | `aitutor-architect` |        the role that produced it
| **inputs** | [PRD — AITutor](…), [Intent 0003 · Set up a course](…) |
| **updated** | 2026-09-12 |
```

### Every chain step has a Jira task

`NNNN · Spec`, `NNNN · Implement`, `NNNN · Deploy`, `NNNN · Validate`, under the
requirement's epic. A role moves its task to `In Progress` when it starts, comments on it
with the page link when it finishes, and **never moves it to `Done`**. `Done` is the
human's act and mirrors `approved` on the page.

### The handover rules

1. **A role may only start when every input page it needs is `approved`.**
   If any input is `draft`, `ready-for-review` or `blocked`, stop and say which page and
   what state it is in. Do not proceed on an unapproved input. The page header is the
   gate; a Jira status is not a substitute for reading it.

2. **A role may never set its own output to `approved`.**
   When you finish, set the page to `ready-for-review`, comment the link on your task,
   and stop. Approval is a human act: they set the page to `approved` and the task to
   `Done`. This is the gate. Marking your own work approved removes it.

3. **Hand over only when the task is ready.**
   Before setting `ready-for-review`, verify your own skill's "Done when" list and state
   the result item by item, on the task as well as in your report. If any item fails,
   set the page to `blocked`, write why under a `## Blocked on` heading, label the task
   `blocked` with the same text as a comment, and stop.

4. **Unanswered questions block the chain.**
   If you cannot complete the artifact without a decision that is not yours to make, set
   the page to `blocked` and list the questions. Never guess and continue.

5. **Stay in your lane.**
   Write only the pages your role owns. If you find a fault in an upstream page, report
   it — as a comment on that page and on your task — do not edit it. Corrections go back
   to the role that owns that page.

6. **Traceability is mandatory.**
   Every page names its `inputs` as links and shares the `id` of the requirement it
   serves; every Jira issue carries `req-NNNN`. An artifact whose ID appears nowhere
   upstream is scope drift, and gets reported.

7. **Superseding, never overwriting.**
   When a decision changes, set the old page to `superseded`, add a `superseded-by` row
   linking the new page, and write a new one. Confluence keeps every version; that history
   is evidence, not clutter.

8. **Keep the indexes and the map honest.**
   When you create a page, add its row to the index page above it and its label. When you
   create a Jira issue, add it to the requirement map in `.claude/ATLASSIAN.md` in the same
   pull request as any repository change, or report the new keys so a human can.

### What to say at the end of every run

Finish every run with exactly these five lines:

```
ARTIFACT:  <page title and URL, or the pull request URL>
JIRA:      <issue key — status you left it in>
STATUS:    ready-for-review | blocked
DONE-WHEN: <each item, met or not met>
NEXT:      <the role that should run next, and what it needs from the human first>
```
