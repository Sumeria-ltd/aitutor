# Impeccable design skills — provenance

Three third-party skills live next to the five `aitutor-*` role skills:

| Skill | What it is |
|---|---|
| `teach-impeccable` | One-time setup. Scans the repo, asks the human the UX and brand questions the code cannot answer, and writes a `## Design Context` section to `.impeccable.md` at the repository root. |
| `frontend-design` | The design principles, the DO/DON'T anti-patterns and seven reference files (typography, colour, spatial, motion, interaction, responsive, UX writing). Refuses to design until design context exists. |
| `critique` | The design-director review — AI-slop verdict first, then hierarchy, information architecture, emotional resonance, affordance, composition, type, colour, states and microcopy — as a prioritised report. This is the skill listed on mcpmarket.com as `ui-ux-design-critique`. |

`critique` mandates `frontend-design`, which mandates `teach-impeccable` on first use; that is why all three are here.

## Source

- Project: **Impeccable** by Paul Bakaus — <https://github.com/pbakaus/impeccable>
- Licence: Apache-2.0 — copy in `frontend-design/LICENSE`; attribution in `frontend-design/NOTICE.md`
  (`frontend-design` itself builds on Anthropic's `frontend-design` skill, also Apache-2.0).
- Pinned to upstream commit `e818c14ff11b55054ba917e8cacb74b8c3cbafd5` (2026-03-17), the last
  revision before Impeccable folded `frontend-design` and `teach-impeccable` into a single
  `impeccable` skill (2026-03-30) and later added an engine binary and edit hooks (v4).
  Every file was fetched from that commit and its git blob hash verified. The mcpmarket listing
  points at a mirror (`hazelugo/fav_gits`) of exactly this revision.
- Not modified. `critique` recommends sibling commands (`/polish`, `/typeset`, …) that are not
  installed; treat those lines as advice about what to fix, not as commands to run.

## Why this revision and not the current one

Current upstream (`skill-v4.x`) is one `/impeccable <command>` skill with 24 commands, but it
installs a hook into `.claude/settings.local.json` that runs on every edit and downloads a
Rust engine binary into `~/.impeccable/bin/` on first run. This revision is pure markdown:
nothing executes, nothing is downloaded, and every line can be read. Upgrading is a
deliberate decision, not a refresh — run `npx impeccable install` only after deciding you
want the hook and the binary.

## Where the output goes

`.impeccable.md` (repository root) holds the design context. It is the input every design
skill reads first and is tracked in git. The chain in `CLAUDE.md` has no design role; the
design context is part of "how it is built" and therefore lives in the repository, next to
`CLAUDE.md`, not in Confluence.
