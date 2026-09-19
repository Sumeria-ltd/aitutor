#!/usr/bin/env bash
#
# The body of the post-merge deployment-ready gate.
#
# This proves main *could* be deployed. It deploys nothing, contacts no cloud provider and
# needs no credentials — which matters, because this repository is public.
#
# Checks no-op with an explicit note when the thing they check does not exist yet. That is
# deliberate: the gate must not block merges to main before there is a Dockerfile or an
# .env.example, but it must start enforcing the moment either one appears, without anyone
# remembering to come back and switch it on.
set -euo pipefail

cd "$(dirname "$0")/.."

FAIL=0
err()  { printf '  FAIL  %s\n' "$*" >&2; FAIL=1; }
ok()   { printf '  ok    %s\n' "$*"; }
skip() { printf '  --    %s\n' "$*"; }

# --- every required setting is named, and none carries a real value ----------------------
#
# Convention, enforced here so it cannot drift: each line of .env.example is a comment, or
# NAME= with an empty value, or NAME=<placeholder> in angle brackets. A real value in this
# file is a leaked credential.
check_config() {
  echo "Configuration"

  if [ ! -f .env.example ]; then
    skip ".env.example does not exist yet; nothing declares required configuration"
    return
  fi

  if git ls-files --error-unmatch .env >/dev/null 2>&1; then
    err ".env is tracked by git; it must be ignored, not committed"
  fi

  n=0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
    esac
    n=$((n + 1))
    name="${line%%=*}"
    value="${line#*=}"

    case "$name" in
      [A-Z_][A-Z0-9_]*) ;;
      *) err ".env.example declares '$name', which is not an ENV_VAR_NAME"; continue ;;
    esac

    case "$value" in
      ''|'<'*'>') ok "$name is declared with no real value" ;;
      *) err "$name in .env.example carries the value '$value'; use an empty value or <placeholder>" ;;
    esac
  done < .env.example

  [ "$n" -gt 0 ] || err ".env.example exists but declares no settings"
}

# --- nothing credential-shaped is committed ----------------------------------------------
check_secrets() {
  echo "Secrets"

  # Patterns are introduced with `git grep -e`, and the exit status is inspected rather than
  # discarded. Both matter. Several patterns begin with a dash: without -e, git parses them
  # as options and exits 129, and if that error is swallowed the scan reports success having
  # searched nothing. A secret scanner that always passes is worse than no scanner, because
  # it is trusted. This is the failure ADR 0004 names, in miniature.
  patterns='-----BEGIN [A-Z ]*PRIVATE KEY-----
"type"[[:space:]]*:[[:space:]]*"service_account"
AIza[0-9A-Za-z_-]{35}
gh[pousr]_[A-Za-z0-9]{36}
sk-[A-Za-z0-9]{32,}'

  found=0
  while IFS= read -r pattern; do
    [ -n "$pattern" ] || continue

    set +e
    hits="$(git grep -nIE -e "$pattern" -- ':!scripts/check-deployable.sh' 2>&1)"
    rc=$?
    set -e

    case "$rc" in
      0)
        found=1
        printf '%s\n' "$hits" | sed 's/^/  FAIL  credential-shaped string: /' >&2
        ;;
      1) ;; # no match, which is the good case
      *)
        err "the secret scan could not run (git grep exited $rc): $hits"
        return
        ;;
    esac
  done <<PATTERNS
$patterns
PATTERNS

  if [ "$found" -eq 1 ]; then
    FAIL=1
  else
    ok "no private keys, service-account blobs or API tokens in tracked files"
  fi
}

# --- the container image builds ----------------------------------------------------------
check_image() {
  echo "Image"

  if [ ! -f Dockerfile ]; then
    skip "no Dockerfile yet; nothing to build for Cloud Run"
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    err "Dockerfile exists but docker is not available to prove it builds"
    return
  fi

  if docker build --quiet --tag aitutor-deployment-check . >/dev/null; then
    ok "Dockerfile builds"
  else
    err "Dockerfile does not build"
  fi
}

# --- the container starts and answers ----------------------------------------------------------
#
# An image that builds but exits on startup is the failure --image cannot see, and it is
# what Cloud Run would report as a revision that never became ready. So: run it with no
# credential and a placeholder project, and require an HTTP answer on $PORT within a few
# seconds. Any status is fine — the API answers 401 or 404 without touching Firestore or
# Firebase, because both clients are lazy — what matters is that a process is listening.
check_run() {
  echo "Run"

  if [ ! -f Dockerfile ]; then
    skip "no Dockerfile yet; nothing to run"
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    err "Dockerfile exists but docker is not available to prove the container starts"
    return
  fi

  if ! docker image inspect aitutor-deployment-check >/dev/null 2>&1; then
    docker build --quiet --tag aitutor-deployment-check . >/dev/null || { err "Dockerfile does not build"; return; }
  fi

  local name="aitutor-deployment-check-$$" port=18080 code=000 i
  # Not --rm: an exited container must still be there for `docker logs` to explain itself.
  docker run --detach --name "$name" --publish "$port:8080" \
    --env GOOGLE_CLOUD_PROJECT=deployment-check aitutor-deployment-check >/dev/null

  # curl prints 000 itself when nothing is listening; `|| true` only keeps set -e quiet. An
  # answer is a real three-digit status — checked as such, so a doubled fallback like
  # "000000" can never read as success.
  for i in $(seq 1 20); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$port/api/me" 2>/dev/null || true)"
    case "$code" in [1-9][0-9][0-9]) break ;; esac
    [ "$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null)" = "true" ] || break # it exited
    sleep 0.5
  done

  case "$code" in
  [1-9][0-9][0-9])
    ok "container starts and answers on \$PORT (GET /api/me → $code)"
    ;;
  *)
    err "container did not answer on \$PORT; its output was:"
    docker logs "$name" 2>&1 | head -12 | sed 's/^/        /' >&2
    ;;
  esac
  docker rm -f "$name" >/dev/null 2>&1 || true
}

case "${1:---all}" in
  --config)  check_config ;;
  --secrets) check_secrets ;;
  --image)   check_image ;;
  --run)     check_run ;;
  --all)     check_config; echo; check_secrets; echo; check_image; echo; check_run ;;
  *) echo "usage: $0 [--all|--config|--secrets|--image|--run]" >&2; exit 2 ;;
esac

if [ "$FAIL" -ne 0 ]; then
  echo
  echo "NOT DEPLOYABLE" >&2
  exit 1
fi
echo
echo "DEPLOYABLE"
