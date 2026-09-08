---
id: <NNNN>
status: draft
owner: aitutor-validator
inputs: [docs/specs/<NNNN>-<slug>.md, docs/prd.md, docs/intents/<NNNN>-<slug>.md, deployment.md]
updated: <date>
---

# Validation <NNNN> — <requirement name>

Deployed URL: <url>
Commit: <sha>

## Pass one — conformance

| Source | Criterion | Verdict | Evidence |
|--------|-----------|---------|----------|
| spec ACCEPT |  | met / partial / missing |  |
| PRD acceptance <NNNN> |  | met / partial / missing |  |

### Scope drift
| File changed | In spec SCOPE? | Note |
|--------------|----------------|------|
|              | yes / no       |      |

### Shipped but never requested
- <anything present that no spec or PRD line asked for>

## Pass two — fidelity
Read only `docs/intents/<NNNN>`. The PRD and the spec are closed.

**PROBLEM:** <quote it> — is that person measurably less stuck?
<answer>

**SUCCESS:** <quote it> — count it. What is the number?
<answer>

**USER:** would that person recognise this as built for them?
<answer>

**NOT NOW:** did anything deferred get built anyway?
<answer>

**Would you write the same intent again?**
<answer>

## What surprised me
<one or two sentences — usually the most valuable part of this document>

## Not checked, and why
<what this validation did not cover>

## Open items
| Item | Owning role | Why it matters |
|------|-------------|----------------|
|      | aitutor-pm / aitutor-architect / aitutor-engineer / aitutor-platform |  |
