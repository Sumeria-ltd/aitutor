#!/usr/bin/env bash
#
# The current body of `make build` and `make test`.
#
# This repository has no application code yet — requirement 0001 (scaffold) is not built.
# The only thing there is to verify is the document pipeline CLAUDE.md defines, so that is
# what these checks verify. They are real invariants, not theatre: they go red when a
# document genuinely breaks, and they have caught nothing yet only because nothing is
# broken yet.
#
# When the scaffold lands, the Makefile targets stop calling this script and call the real
# compile and the real suite instead. Do not rename the Makefile targets when that happens:
# .github/rulesets/main.json names the resulting checks, and renaming them silently removes
# the merge gate.
set -euo pipefail

cd "$(dirname "$0")/.."

FAIL=0
err() { printf '  FAIL  %s\n' "$*" >&2; FAIL=1; }
ok()  { printf '  ok    %s\n' "$*"; }

# Value of a YAML frontmatter key, or empty if the file has no frontmatter or no such key.
fm() {
  awk -v key="$2" '
    NR == 1     { if ($0 != "---") exit; next }
    $0 == "---" { exit }
    index($0, key ":") == 1 {
      sub(/^[^:]*:[[:space:]]*/, "")
      print
      exit
    }
  ' "$1"
}

# --- build: does the document structure resolve? -----------------------------------------
#
# Deliberately narrow. A blanket dead-link sweep would fail on the PRD's references to
# superseded documents (`docs/PRD.md`, `docs/intent/`), which are historical by design and
# correctly absent from the working tree.
check_structure() {
  echo "Structure"

  [ -f docs/prd.md ] && ok "docs/prd.md exists" || err "docs/prd.md is missing"

  # Only the traceability table counts, which is why this reads table rows rather than the
  # whole file. The PRD's prose legitimately names documents that do not exist — superseded
  # versions of itself, and requirements it records as having been removed. Treating those as
  # broken references makes the check cry wolf, and a check that cries wolf gets switched off.
  refs="$(grep -E '^\|' docs/prd.md 2>/dev/null \
            | grep -oE 'docs/intents/[0-9]{4}-[a-z0-9-]+\.md' | sort -u || true)"
  if [ -z "$refs" ]; then
    err "docs/prd.md names no intent files; its traceability table is missing or malformed"
    return
  fi

  for ref in $refs; do
    if [ -f "$ref" ]; then
      ok "$ref is named by the PRD and exists"
    else
      err "docs/prd.md names $ref, which does not exist"
    fi
  done

  for f in docs/intents/*.md; do
    [ -e "$f" ] || continue
    case "$refs" in
      *"$f"*) ;;
      *) err "$f exists but no requirement in docs/prd.md names it" ;;
    esac
  done
}

# --- test: do the documents hold the invariants CLAUDE.md defines? -----------------------
check_invariants() {
  echo "Invariants"

  status="$(fm docs/prd.md status)"
  check_status docs/prd.md "$status"

  for dir in docs/intents docs/adr docs/specs docs/validation; do
    [ -d "$dir" ] || continue
    ids=""
    for f in "$dir"/*.md; do
      [ -e "$f" ] || continue

      check_status "$f" "$(fm "$f" status)"
      [ -n "$(fm "$f" owner)" ] || err "$f declares no owner"

      id="$(fm "$f" id)"
      base="$(basename "$f")"
      prefix="${base%%-*}"

      case "$id" in
        [0-9][0-9][0-9][0-9]) ;;
        *) err "$f declares id '$id', which is not a four-digit requirement ID"; continue ;;
      esac

      if [ "$id" = "$prefix" ]; then
        ok "$f carries id $id"
      else
        err "$f declares id '$id' but its filename begins '$prefix'"
      fi

      ids="$ids$id
"
    done

    dupes="$(printf '%s' "$ids" | sed '/^$/d' | sort | uniq -d)"
    if [ -n "$dupes" ]; then
      for d in $dupes; do
        err "$dir has more than one document carrying id $d; one requirement, one ID"
      done
    fi
  done
}

check_status() {
  case " draft ready-for-review approved blocked " in
    *" $2 "*) ;;
    *) err "$1 has status '$2'; CLAUDE.md allows draft, ready-for-review, approved, blocked" ;;
  esac
}

case "${1:---invariants}" in
  --structure)  check_structure ;;
  --invariants) check_invariants ;;
  *) echo "usage: $0 [--structure|--invariants]" >&2; exit 2 ;;
esac

if [ "$FAIL" -ne 0 ]; then
  echo
  echo "FAILED" >&2
  exit 1
fi
echo
echo "PASSED"
