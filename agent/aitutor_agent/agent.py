"""An agent that answers a learner from their own course material, and nothing else.

It runs on Vertex AI Agent Engine and reaches the material over MCP, by calling the
`/api/mcp` endpoint the API serves. It holds no retrieval logic of its own on purpose: the
allow-list of what a learner may read, the cross-learner isolation assertion and the
deleted-material exclusion all live behind that endpoint, and duplicating any of it here
would create a second place those guarantees could be got wrong.

**Why this is Python in a TypeScript repository.** Agent Engine's runtime is Python. That is
the only reason, and it is why this directory holds an agent and nothing else — no product
logic, no types the API also needs, nothing that would drift.

**Why the MCP session is opened per tool call rather than once at startup.** Identity. The
endpoint takes the learner from a verified Firebase token and offers no way to pass a learner
id as an argument, which is what makes it unable to serve the wrong person's material. So the
token has to travel on the request, and the token belongs to whoever is asking *now* — it
cannot be baked into a connection made when the agent was deployed. One session per call is
the cost of that, and it is the right trade.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from typing import Any

import httpx
from google.adk.agents import LlmAgent
from google.adk.tools import ToolContext
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

MODEL = os.environ.get("AITUTOR_MODEL", "gemini-2.5-flash")
MCP_URL = os.environ.get("AITUTOR_MCP_URL", "https://aitutor-api-aomg5sxb3a-ew.a.run.app/api/mcp")

# A ceiling on one tool call, not on the run. The run's bound belongs to whatever drives the
# agent; this is only here so a hung endpoint cannot hold a session open indefinitely.
CALL_TIMEOUT_SECONDS = 30.0


async def _call_mcp(tool: str, arguments: dict[str, Any], id_token: str) -> dict[str, Any]:
    """Open an MCP session as the learner, call one tool, close it.

    The Authorization header is the whole point: it is what makes the server decide, from a
    token it verifies itself, whose material this is. Nothing in `arguments` says who is
    asking, and the server would ignore it if it did.
    """
    headers = {"Authorization": f"Bearer {id_token}"}
    timeout = httpx.Timeout(CALL_TIMEOUT_SECONDS)
    async with httpx.AsyncClient(headers=headers, timeout=timeout) as http_client:
        async with streamable_http_client(MCP_URL, http_client=http_client) as streams:
            read, write = streams[0], streams[1]
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(tool, arguments)

    # The server puts the useful shape in structuredContent and a human sentence in content.
    #
    # Read both spellings on purpose. The wire format is camelCase, and the Python client
    # exposes it snake_cased — `structured_content`, `is_error`. Reading only the wire spelling
    # is a bug that does not announce itself: every call still "succeeds", the structured
    # passages are silently missed, and the agent answers from the one-line summary instead.
    # That was caught by running the real client against the real route, not by reading docs.
    failed = bool(getattr(result, "is_error", None) or getattr(result, "isError", None))
    structured = getattr(result, "structured_content", None)
    if structured is None:
        structured = getattr(result, "structuredContent", None)
    if isinstance(structured, dict):
        return {"ok": not failed, **structured}

    text = " ".join(
        getattr(block, "text", "") for block in (getattr(result, "content", None) or [])
    ).strip()
    return {"ok": not failed, "message": text}


def _reason(cause: BaseException) -> str:
    """A short reason a model can repeat to a learner without alarming them.

    The MCP client wraps transport failures in an anyio task group, so the raw text of a
    rejected call is "unhandled errors in a TaskGroup (1 sub-exception)" — true, useless, and
    the sort of thing a model will read out loud. Unwrap one level and keep it short.
    """
    inner: BaseException = cause
    while isinstance(inner, BaseExceptionGroup) and inner.exceptions:
        inner = inner.exceptions[0]
    text = str(inner).strip()
    if "401" in text or "unauthenticated" in text.lower():
        return "the learner's sign-in has expired; they need to sign in again"
    return text[:160] if text else inner.__class__.__name__


def _session_value(tool_context: ToolContext, key: str) -> str:
    value = tool_context.state.get(key)
    return value.strip() if isinstance(value, str) else ""


async def search_material(query: str, tool_context: ToolContext) -> dict[str, Any]:
    """Search the learner's own material for this course.

    Returns passages, each carrying the session it came from. Use only these passages to
    answer. If they do not cover the question, say so — do not fill the gap from general
    knowledge.

    Args:
      query: what to look for, in the learner's own words.
    """
    id_token = _session_value(tool_context, "id_token")
    course_id = _session_value(tool_context, "course_id")
    if not id_token:
        # Said plainly rather than retried: without a learner's token there is no learner, and
        # guessing one is the failure this whole design exists to make impossible.
        return {"ok": False, "message": "No learner credential in this session; cannot search."}
    if not course_id:
        return {"ok": False, "message": "No course selected in this session."}

    try:
        return await _call_mcp("search_material", {"courseId": course_id, "query": query}, id_token)
    except Exception as cause:  # noqa: BLE001 - surfaced to the model as a failed tool call
        return {"ok": False, "message": f"The material could not be searched — {_reason(cause)}"}


def current_time() -> dict[str, Any]:
    """The current date and time, in UTC.

    Use this when the learner asks what the time or date is, or when a plan needs to know
    today. Do not guess either.
    """
    # A model has no clock. Without this tool the honest answer to "what time is it" is "I do
    # not know", and the tempting answer is a confident fabrication — which is the same defect
    # as answering a course question from general knowledge, in a different costume.
    now = datetime.now(tz=UTC)
    return {"ok": True, "utc": now.isoformat(timespec="seconds"), "weekday": now.strftime("%A")}


async def list_sessions(tool_context: ToolContext) -> dict[str, Any]:
    """List the sessions of the learner's current course, in the order they arranged them."""
    id_token = _session_value(tool_context, "id_token")
    course_id = _session_value(tool_context, "course_id")
    if not id_token or not course_id:
        return {"ok": False, "message": "No learner credential or course in this session."}
    try:
        return await _call_mcp("list_sessions", {"courseId": course_id}, id_token)
    except Exception as cause:  # noqa: BLE001
        return {"ok": False, "message": f"The sessions could not be listed — {_reason(cause)}"}


INSTRUCTION = """\
You are a study companion for one learner. Their own course material is the only source you \
have for anything the course taught.

**A message may contain several requests.** Deal with each of them. Refusing a whole message \
because one part is not covered by the material is a defect, not caution — it is the most \
likely way you will fail this learner.

For each request, decide which kind it is.

**About what the course taught** — what a session covered, what a term means in this course, \
what the material says, what to revise from it. Call `search_material` and use only the \
passages it returns. Name the session you drew on, by its title, so the learner can check \
you. If the passages do not cover it, say so for that request and name what appears to be \
missing; that is a correct outcome, and it lets them go and add the handout. **Never close a \
gap in their material with your own knowledge**, however confident you are. They cannot tell \
the difference, and they would stop checking you — which is the one thing that must not \
happen.

**Not about what the course taught** — the time or date, putting the sessions you can see \
into a revision order, general advice on how to revise, the meaning of an ordinary word in \
their message. Answer it. Begin that part with "Not from your material:" so they can always \
tell which of your sentences came from their course and which did not.

**Answer what the material does support, even when it does not support everything.** If it \
gives the run of the sessions but no exam date, build the order and say the date is not \
there. A partial answer that names its gap beats a refusal.

**You have no clock.** Call `current_time` when the time or the date matters. Do not guess \
one, and do not infer one from the material — a fabricated date is the same failure as a \
fabricated fact.

If the tool says material is still being read, say that. It is a different thing from the \
material not covering the question, and telling the learner the wrong one of those two is \
worse than saying nothing.

You cannot change anything. You have no tool that deletes, renames, moves or writes; if \
asked, say you can only read and that they should make the change themselves.

Never write the learner's own summary or notes for them. You may ask them about what they \
wrote; producing it for them removes the work that makes them remember it.
"""

root_agent = LlmAgent(
    name="aitutor_material_agent",
    model=MODEL,
    instruction=INSTRUCTION,
    description="Answers a learner's questions from their own course material, with citations.",
    tools=[search_material, list_sessions, current_time],
)
