#!/usr/bin/env sh
# Starts an MCP server with the repository's .env loaded.
#
# Claude Code expands ${VAR} in .mcp.json from its own environment only, so a git-ignored
# .env at the repository root is invisible to it. This launcher reads that file first, sets
# every NAME=value it finds that is not already set (an exported variable always wins), maps
# the ATLASSIAN_* pair onto the names mcp-atlassian reads, and execs the server. .mcp.json
# names it as the command; the real command follows as arguments.
set -eu
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    key=${line%%=*}
    value=${line#*=}
    case "$key" in ''|*[!A-Za-z0-9_]*) continue ;; esac
    value=${value#\"}; value=${value%\"}
    if eval "[ -z \"\${$key:-}\" ]"; then
      export "$key=$value"
    fi
  done < .env
fi

# mcp-atlassian wants the same identity under two names; developers keep one pair.
if [ -n "${ATLASSIAN_EMAIL:-}" ]; then
  : "${JIRA_USERNAME:=$ATLASSIAN_EMAIL}"; : "${CONFLUENCE_USERNAME:=$ATLASSIAN_EMAIL}"
  export JIRA_USERNAME CONFLUENCE_USERNAME
fi
if [ -n "${ATLASSIAN_API_TOKEN:-}" ]; then
  : "${JIRA_API_TOKEN:=$ATLASSIAN_API_TOKEN}"; : "${CONFLUENCE_API_TOKEN:=$ATLASSIAN_API_TOKEN}"
  export JIRA_API_TOKEN CONFLUENCE_API_TOKEN
fi

exec "$@"
