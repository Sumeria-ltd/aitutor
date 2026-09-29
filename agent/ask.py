"""Ask the deployed agent a question, as a learner. The demo driver.

    export AITUTOR_ID_TOKEN="<a learner's Firebase ID token>"
    python ask.py <courseId> "what did week three say about entropy?"

Getting the token: sign in to the web app, open the browser console and run
`await firebase.auth().currentUser.getIdToken()` — or, since the app keeps no global, take it
from the `Authorization` header of any `/api/` request in the network tab. It lasts about an
hour.

The token goes into the agent's **session state**, not into the question and not into the
agent's configuration. That is the whole shape of this design: the agent has no standing
authority over anybody's material, and every tool call it makes carries the credential of
whoever is asking right now. An agent nobody has given a token to can search nothing.
"""

from __future__ import annotations

import os
import sys

import vertexai
from vertexai import agent_engines

PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "aitutor-509111")
LOCATION = os.environ.get("AITUTOR_AGENT_LOCATION", "us-central1")
DISPLAY_NAME = "aitutor-material-agent"


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(__doc__)
        return 2
    course_id, question = argv[1], " ".join(argv[2:])

    id_token = os.environ.get("AITUTOR_ID_TOKEN", "").strip()
    if not id_token:
        print("AITUTOR_ID_TOKEN is not set. Without a learner's token there is no learner.")
        return 2

    vertexai.init(project=PROJECT, location=LOCATION)
    engines = [e for e in agent_engines.list() if getattr(e, "display_name", "") == DISPLAY_NAME]
    if not engines:
        print(f"no agent called {DISPLAY_NAME} in {LOCATION} — run deploy.py first")
        return 1
    engine = engines[0]

    # The credential and the course live in session state. The question carries neither, so a
    # question cannot smuggle an identity and a transcript does not contain one.
    session = engine.create_session(
        user_id="demo",
        state={"id_token": id_token, "course_id": course_id},
    )
    session_id = session["id"] if isinstance(session, dict) else session.id

    print(f"agent:   {engine.resource_name}")
    print(f"course:  {course_id}")
    print(f"asking:  {question}\n")

    for event in engine.stream_query(user_id="demo", session_id=session_id, message=question):
        # Tool calls are printed as they happen, because watching the agent reach for the
        # material is most of what there is to see — the answer alone looks like any chatbot.
        for part in ((event.get("content") or {}).get("parts") or []):
            if call := part.get("function_call"):
                print(f"  → tool  {call.get('name')}({call.get('args')})")
            if response := part.get("function_response"):
                payload = response.get("response") or {}
                passages = payload.get("passages")
                if isinstance(passages, list):
                    print(f"  ← tool  {len(passages)} passage(s)")
                    for p in passages:
                        print(f"          from “{p.get('sessionTitle')}” ({p.get('filename')})")
                else:
                    print(f"  ← tool  {payload.get('message', payload)}")
            if text := part.get("text"):
                print(f"\n{text}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
