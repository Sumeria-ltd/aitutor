"""Deploy the material agent to Vertex AI Agent Engine.

Run it by hand, like `make deploy` — there is no workflow for this yet, deliberately. The
first few deploys of a new Vertex surface in this project have each cost a spike per fact
(see the comment block at the top of `apps/api/src/rag.ts`), and automating something before
its failure modes are known just hides them behind a green tick.

    cd agent && . .venv/bin/activate && python deploy.py

Re-running it updates the existing engine in place rather than creating a second one, matched
on display name. That matters: `reasoningEngines.create` is perfectly happy to give you five
identical agents and no warning, and then a demo points at whichever one you last copied.
"""

from __future__ import annotations

import os
import sys

import vertexai
from vertexai import agent_engines

PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "aitutor-509111")
# Agent Engine is not served everywhere, and us-central1 is where this project's RAG corpus
# already lives — same reasoning as RAG_LOCATION in apps/api/src/rag.ts.
LOCATION = os.environ.get("AITUTOR_AGENT_LOCATION", "us-central1")
STAGING_BUCKET = os.environ.get("AITUTOR_STAGING_BUCKET", f"gs://{PROJECT}-agent-staging")
DISPLAY_NAME = "aitutor-material-agent"

MCP_URL = os.environ.get(
    "AITUTOR_MCP_URL", "https://aitutor-api-aomg5sxb3a-ew.a.run.app/api/mcp"
)

# Pinned rather than floating. An agent that silently picks up a new ADK on redeploy is an
# agent whose behaviour changed for a reason nobody wrote down.
REQUIREMENTS = [
    "google-cloud-aiplatform[adk,agent_engines]==2.2.0",
    "google-adk==2.10.0",
    # Not pulled in by the adk extra, and the agent is useless without it.
    "mcp==2.2.0",
    "httpx==0.28.1",
]


def main() -> int:
    vertexai.init(project=PROJECT, location=LOCATION, staging_bucket=STAGING_BUCKET)

    # Imported here rather than at module scope so that `vertexai.init` has run first: the ADK
    # reads project configuration at import time in some versions, and a wrong default only
    # shows up as a confusing failure inside the deployed container.
    from aitutor_agent.agent import root_agent

    app = agent_engines.AdkApp(agent=root_agent, enable_tracing=True)

    existing = [
        engine
        for engine in agent_engines.list()
        if getattr(engine, "display_name", None) == DISPLAY_NAME
    ]
    if len(existing) > 1:
        names = ", ".join(e.resource_name for e in existing)
        print(f"refusing to guess: {len(existing)} engines are called {DISPLAY_NAME} — {names}")
        return 1

    common = {
        "requirements": REQUIREMENTS,
        "extra_packages": ["aitutor_agent"],
        "display_name": DISPLAY_NAME,
        "description": "Answers a learner from their own course material, over MCP.",
        # The URL is baked in; the learner's token is not, and must not be. It arrives per
        # request in session state — see the module docstring in aitutor_agent/agent.py.
        "env_vars": {"AITUTOR_MCP_URL": MCP_URL},
    }

    if existing:
        engine = existing[0]
        print(f"updating {engine.resource_name}")
        engine.update(agent_engine=app, **common)
    else:
        print(f"creating {DISPLAY_NAME} in {LOCATION}")
        engine = agent_engines.create(agent_engine=app, **common)

    print(f"resource name: {engine.resource_name}")
    print(f"mcp url:       {MCP_URL}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
