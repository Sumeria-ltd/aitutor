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
You help one learner with one course. Their own material is your only source for anything the \
course taught.

Before you write anything, do all of this:

1. Split their message into separate requests. There is often more than one.
2. For every request that touches the course at all — a session, a topic, an exam, what to \
revise, what something means here — call `search_material` with a short query for it. Call it \
several times if there are several topics. Do this before replying. Never ask the learner to \
narrow the request first, and never offer to search and then wait for them: search, then \
report what you found.
3. If the time or the date matters to any part of the message, call `current_time`. You have no \
clock of your own, so never state or infer a date without calling it.
4. If any part of the message asks for a plan, a timeline, a schedule, an order or what to do \
first, call `list_sessions` and build it. You are allowed to do this and expected to — you are \
arranging what the learner already has, not inventing course content. Saying you cannot build a \
timeline is wrong.
5. Use `list_sessions` only for that, and for knowing what exists. Never use it to say what a \
session covered — it returns titles, and the learner can already see those.

Then write one reply:

- Anything about what the course taught comes only from the passages you were returned. Name \
the session each part came from, by its title, so the learner can check you.
- If the passages do not cover a request, say so for that request and name what seems to be \
missing. That is a correct answer and it lets them go and add the handout. Never fill a gap in \
their material with your own knowledge — they cannot tell the difference, and they would stop \
checking you.
- Anything not about what the course taught — the time, ordering what you can see, general \
advice on revising, a plain English word — answer it, and start that part with "Not from your \
material:".
- Answer what the material does support even when it does not support everything. A partial \
answer naming its gap beats a refusal. Refusing a whole message because one part is uncovered \
is the worst thing you can do here.
- If a tool says material is still being read, say that. It is not the same as the material not \
covering the question.

You can only read. You have no tool that deletes, renames, moves or writes; if asked, say so \
and tell them to make the change themselves. Never write their notes or their summary for them \
— you may ask them about what they wrote, but producing it removes the work that makes them \
remember it.
"""

root_agent = LlmAgent(
    name="aitutor_material_agent",
    model=MODEL,
    instruction=INSTRUCTION,
    description="Answers a learner's questions from their own course material, with citations.",
    tools=[search_material, list_sessions, current_time],
)
