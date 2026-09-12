<!-- Page title: `Spec <NNNN> · <feature name>`. The table below is the status header; nothing may precede it. -->

| | |
|---|---|
| **id** | <NNNN> |
| **status** | `draft` |
| **owner** | `aitutor-architect` |
| **inputs** | [Intent <NNNN> · <title>](…), [PRD — AITutor](…), [ADR 0001 · …](…), … , `CLAUDE.md` |
| **updated** | <date> |

# Spec <NNNN> — <feature name>

Implements intent <NNNN>. Bound by ADR <list the numbers>.

APPROACH:   <the shape chosen, in two lines>
            Rejected: <option> (<reason>)
            Rejected: <option> (<reason>)

INTERFACE:  <routes, functions or payloads other code will depend on>

DATA:       <what is stored, in what shape>
            <what is deliberately not stored>

STACK:      <exact frameworks and versions, from CLAUDE.md and the ADRs>

SCOPE:      <explicit list of files to create or change>

OUT:        <what must not be touched or added>

ACCEPT:     <testable criterion>  -> PRD acceptance <NNNN>
            <testable criterion>  -> PRD acceptance <NNNN>

RISKS:      <what you expect to go wrong; the validator checks these first>

## Unmapped acceptance lines
<Any PRD acceptance line with this ID that this spec does not satisfy. Empty is fine.
Silence is not.>
