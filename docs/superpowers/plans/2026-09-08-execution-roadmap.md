# Execution roadmap — AITutor

Date: 2026-09-08
Status: proposed

Written under the writing-plans skill, which places plans here. **This is not a chain
artifact.** It carries no requirement ID and nothing downstream depends on it. The chain's
executable unit is a spec: `aitutor-engineer` reads a spec's `SCOPE` and `ACCEPT` and writes
a failing test per ACCEPT line. This document decides *which spec gets written next and what
must be answered first* — it does not replace one.

## Where the project actually is

| Artifact | State |
|---|---|
| `docs/prd.md` | approved — 9 requirements, ranked, plus a scaffold constraint in §7 |
| `docs/intents/0001-0009` | approved |
| `docs/adr/0001-0007` | approved |
| `docs/specs/` | **empty — this is the bottleneck** |
| Application code | none |
| CI | document invariants gated; no build or test gate, because there is nothing to build |
| Deployment target | none. `gcloud` is pointed at an unrelated project |

Nothing can be implemented until a spec exists, and no spec can be written until the
decisions below are made.

## Decisions needed before stage 1

**D1 — Does spec `0001` include standing up the repository?**
The scaffold is a PRD §7 constraint, not a requirement, so it has no intent and cannot have
its own spec under the one-spec-one-intent rule. Requirement `0001` is register-an-account,
and §7 says the repository must be installable and testable before anything ships into it.
*Recommendation: yes* — spec `0001` covers register-an-account and stands the repository up
per ADR 0003 and ADR 0004, because the constraint binds it.
*If no:* the scaffold needs a home outside the chain, and that is a workflow change.

**D2 — Who emits the measurement events, and when?**
PRD §10 says requirement `0009` is built last but its signals must be emitted from the first
commit onward, or the first cohort produces no answers. Intent `0009`'s first open question
asks whether that belongs to each earlier spec as it ships, or to a slice ahead of them.
*This changes what spec `0001` is responsible for, so it cannot be deferred.*
*Recommendation:* each spec carries its own events, with the event shape fixed once in an ADR
so nine specs do not each invent one.

**D3 — Promote the CI design to ADRs?**
`docs/superpowers/specs/2026-09-08-github-actions-cicd-design.md` asks the architect directly.
It holds live architecture decisions outside the ADR set: workflows call a Make contract
rather than a toolchain; CI triggers on push because `GITHUB_TOKEN` will not fire
`pull_request`; merge blocking is a committed ruleset. *Recommendation: promote those three as
ADRs 0008–0010 and mark the design doc superseded.*

**D4 — A deployment target must exist before stage 1 ends.**
No GCP project exists for this product. `aitutor-platform` needs one, plus a billing account
and the cost alert its checklist calls mandatory. Blocks nothing until the first deploy, then
blocks everything.

## Sequence

Each row is one pass of the chain. A spec is written, the human approves it, the engineer
implements against it, and the validator closes it. No role starts on an unapproved input.

### Stage 0 — clear the desk

| # | Work | Role | Gate |
|---|---|---|---|
| 0.1 | Split `f16c25b`, which mixes the document renumber with the CI pipeline | — | user says go; branch is unpushed |
| 0.2 | ADRs 0008–0010 from the CI design; supersede that file | `aitutor-architect` | D3 |
| 0.3 | ADR fixing the measurement-event shape | `aitutor-architect` | D2 |
| 0.4 | Component diagram beside the ADRs, as an artifact | `aitutor-architect` | optional |

### Stage 1 — P0 foundation, nothing pays back yet

| # | Work | Role | Blocked on |
|---|---|---|---|
| 1.1 | Spec `0001` register-an-account **+ repository scaffold** | architect | D1, D2 |
| 1.2 | Implement `0001` — TDD, one failing test per ACCEPT line | engineer | 1.1 approved |
| 1.3 | First deploy: `deployment.md`, error reporting, **mandatory cost alert** | platform | 1.2, D4 |
| 1.4 | Validate `0001` — conformance, then fidelity | validator | 1.3 |
| 1.5 | Spec → build → validate `0002` sign-in-again | all four | — |
| 1.6 | Spec → build → validate `0003` set-up-a-course | all four | PRD OQ3, OQ4 |
| 1.7 | Spec → build → validate `0004` capture-a-session | all four | intent `0004` OQ2 |

**Stage 1 exits when** a learner completes journey J1 on a phone and material processing
failures are the exception. PRD §10 calls this phase deliberately unrewarding — nothing here
pays back, which is exactly why stage 2 must follow immediately and stage 1 must not be
extended.

### Stage 2 — P1 payback

| # | Work | Blocked on |
|---|---|---|
| 2.1 | `0005` check-my-summary — **first in this stage**, it is the most direct test of the thesis | intent `0005` OQ1 (how specific is too specific) |
| 2.2 | `0006` ask-my-course — the citation invariant becomes real here | intent `0006` OQ2; ADR 0005's unread-material question |
| 2.3 | `0007` quiz-me | intent `0007` OQ1 |

**Exits when** the repeat-use risk in PRD §8 is measurable and inside threshold, and `0006`
shows zero out-of-scope attributions across twenty questions.

### Stage 3 — P2 orientation

| # | Work | Blocked on |
|---|---|---|
| 3.1 | `0008` see-my-readiness | **intent `0008` OQ1 — unsolved and probably the hard part of the product** |

Nothing in `0003`, `0004` or `0007` asks the learner to link material or a practice result to
an objective, and readiness depends entirely on that link existing. This needs a product
answer before it needs a spec, and the answer may be a new requirement.

### Stage 4 — P3 operator

| # | Work | Blocked on |
|---|---|---|
| 4.1 | `0009` know-its-working | PRD OQ7 (who the operator is), OQ8 (measuring below ~20 learners) |

Build last; the events were emitted from stage 1 under D2.

## The risks this ordering is managing

- **Stage 1 pays back nothing.** Four requirements ship before a learner sees any return on
  effort. PRD §8 names capture dying around week three as the top risk, and stage 1 is where
  that habit is either formed or not — with none of the payback that makes it worth forming.
  The mitigation is to keep stage 1 short, not to reorder it.
- **`0008`'s missing link is a product gap, not a scheduling one.** Discovering it at stage 3
  would be expensive. It is written down here so it is answered early.
- **`0009` is late but its data is not.** If D2 slips, the first cohort produces no answers and
  the two existential risks in PRD §8 stay unmeasured.

## What this roadmap does not do

It does not sequence work inside a stage beyond the order given, because that depends on
specs that do not exist. It names no versions, no schemas and no interfaces — those belong to
the specs. And it makes no claim about dates: PRD §10's phases exit on evidence.
