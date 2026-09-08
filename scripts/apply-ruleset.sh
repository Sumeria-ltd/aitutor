#!/usr/bin/env bash
#
# Pushes .github/rulesets/main.json to the repository's settings.
#
# GitHub does not read rulesets out of the repository — they live in settings, behind a web
# form. Committing the JSON alone protects nothing. This script is what makes the committed
# file the truth, and re-running it updates the live ruleset in place rather than stacking
# duplicates.
#
# Requires the gh CLI, authenticated with admin on the repository.
set -euo pipefail

cd "$(dirname "$0")/.."

FILE=".github/rulesets/main.json"
# Must match the "name" field inside $FILE. Hardcoded so the script needs no jq.
NAME="main"

usage() {
  cat <<USAGE
usage: $(basename "$0") [--apply|--disable|--enable|--show|--delete]

  --apply    Create or update the ruleset from $FILE (enforcement as written in the file)
  --disable  Escape hatch. Stop enforcing without deleting, for when CI itself is broken
  --enable   Resume enforcing after --disable
  --show     Print the live ruleset
  --delete   Remove the ruleset entirely
USAGE
}

repo() { gh repo view --json nameWithOwner --jq .nameWithOwner; }

ruleset_id() {
  gh api "repos/$1/rulesets" --jq "map(select(.name == \"$NAME\")) | .[0].id // empty" 2>/dev/null || true
}

REPO="$(repo)"
ID="$(ruleset_id "$REPO")"

case "${1:---apply}" in
  --apply)
    if [ -n "$ID" ]; then
      gh api --method PUT "repos/$REPO/rulesets/$ID" --input "$FILE" >/dev/null
      echo "Updated ruleset '$NAME' (id $ID) on $REPO."
    else
      ID="$(gh api --method POST "repos/$REPO/rulesets" --input "$FILE" --jq .id)"
      echo "Created ruleset '$NAME' (id $ID) on $REPO."
    fi
    echo "main now requires a pull request with the 'build' and 'test' checks passing."
    ;;
  --disable|--enable)
    [ -n "$ID" ] || { echo "No ruleset '$NAME' on $REPO. Run --apply first." >&2; exit 1; }
    want="disabled"; [ "$1" = "--enable" ] && want="active"
    gh api --method PUT "repos/$REPO/rulesets/$ID" -f "enforcement=$want" >/dev/null
    echo "Ruleset '$NAME' on $REPO is now $want."
    [ "$want" = "disabled" ] && echo "Remember to re-enable it: $(basename "$0") --enable"
    ;;
  --show)
    [ -n "$ID" ] || { echo "No ruleset '$NAME' on $REPO."; exit 0; }
    gh api "repos/$REPO/rulesets/$ID"
    ;;
  --delete)
    [ -n "$ID" ] || { echo "No ruleset '$NAME' on $REPO."; exit 0; }
    gh api --method DELETE "repos/$REPO/rulesets/$ID"
    echo "Deleted ruleset '$NAME' from $REPO. main is now unprotected."
    ;;
  -h|--help) usage ;;
  *) usage >&2; exit 2 ;;
esac
