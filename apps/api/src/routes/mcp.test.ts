import { ROUTES } from "@aitutor/shared";
import { describe, expect, it } from "vitest";
import { fakeVerifier } from "../auth.ts";
import { emitter } from "../events.ts";
import { inMemoryFiles } from "../files.ts";
import { inMemoryStore, type Store } from "../firestore.ts";
import {
  dispatch,
  type JsonObject,
  requiresGrant,
  signature,
  TOOLS,
  type Tool,
  type ToolContext,
} from "../mcp.ts";
import { fakeRag, type Rag } from "../rag.ts";
import { mountCourses } from "./courses.ts";
import { mountMaterial } from "./material.ts";
import { MCP_ROUTES, mountMcp, SESSION_HEADER } from "./mcp.ts";
import { createApp } from "./me.ts";

const ADA = { uid: "ada", email: "ada@example.test" };
const BOB = { uid: "bob", email: "bob@example.test" };

function harness(opts: { rag?: Rag; tools?: Tool[] } = {}) {
  const store: Store = inMemoryStore();
  const files = inMemoryFiles();
  const rag = opts.rag ?? fakeRag();
  const verifier = fakeVerifier({ "ada-token": ADA, "bob-token": BOB });
  let n = 0;
  const newId = () => `id-${++n}`;
  const pending: Promise<unknown>[] = [];
  const clock = new Date("2026-09-29T09:00:00.000Z");

  const app = createApp({ store, verifier });
  mountCourses(app, { store, verifier, newId, rag, files });
  mountMaterial(app, {
    store,
    verifier,
    files,
    rag,
    newId,
    now: () => clock,
    emit: emitter(store, () => clock, "0010"),
    afterResponse: (w) => pending.push(w),
  });
  mountMcp(app, {
    store,
    verifier,
    rag,
    newSessionId: () => "session-1",
    ...(opts.tools ? { tools: opts.tools } : {}),
  });

  const call = (token: string | null, path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    });

  /** One JSON-RPC call over the real route. */
  const rpc = async (token: string | null, method: string, params?: unknown, id: unknown = 1) => {
    const res = await call(token, MCP_ROUTES.rpc, {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), method, params }),
      headers: { "content-type": "application/json" },
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  /** `settle` false leaves the detached import running, which is how a material is observed
   *  in `reading`. Awaiting it would hang when the import is deliberately stuck. */
  async function seed(
    token: string,
    courseName: string,
    sessionTitle: string,
    text: string,
    settle = true,
  ) {
    await call(token, ROUTES.session, {
      method: "POST",
      body: JSON.stringify({ idToken: token }),
      headers: { "content-type": "application/json" },
    });
    const { course } = (await (
      await call(token, ROUTES.courses, {
        method: "POST",
        body: JSON.stringify({ name: courseName }),
        headers: { "content-type": "application/json" },
      })
    ).json()) as { course: { id: string } };
    const { session } = (await (
      await call(token, `/api/courses/${course.id}/sessions`, {
        method: "POST",
        body: JSON.stringify({ title: sessionTitle }),
        headers: { "content-type": "application/json" },
      })
    ).json()) as { session: { id: string } };
    const form = new FormData();
    form.set("file", new File([text], "week3.pdf", { type: "application/pdf" }));
    await call(token, `/api/courses/${course.id}/sessions/${session.id}/materials`, {
      method: "POST",
      body: form,
    });
    if (settle) await Promise.all(pending);
    return { courseId: course.id, sessionId: session.id };
  }

  return { store, rag, call, rpc, seed };
}

describe("the MCP endpoint", () => {
  it("refuses an unauthenticated call", async () => {
    const h = harness();
    const { status } = await h.rpc(null, "tools/list");
    expect(status).toBe(401);
  });

  it("announces the protocol and the tools", async () => {
    const h = harness();
    await h.seed("ada-token", "Thermo", "Week 3", "entropy rises");

    const init = await h.rpc("ada-token", "initialize");
    expect(init.body.result.protocolVersion).toBe("2025-06-18");
    expect(init.body.result.capabilities.tools).toBeDefined();

    const list = await h.rpc("ada-token", "tools/list");
    const names = (list.body.result.tools as { name: string }[]).map((t) => t.name).sort();
    expect(names).toEqual(["list_courses", "list_sessions", "search_material"]);
  });

  it("answers a notification with 202 and no body", async () => {
    const h = harness();
    const res = await h.call("ada-token", MCP_ROUTES.rpc, {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("searches the learner's own material and attributes each passage to a session", async () => {
    const h = harness();
    const { courseId, sessionId } = await h.seed("ada-token", "Thermo", "Week 3", "entropy rises");

    const { body } = await h.rpc("ada-token", "tools/call", {
      name: "search_material",
      arguments: { courseId, query: "entropy" },
    });
    const passages = body.result.structuredContent.passages as { session: string }[];
    expect(passages.length).toBeGreaterThan(0);
    for (const p of passages) expect(p.session).toBe(sessionId);
    expect(body.result.isError).toBeUndefined();
  });

  it("cannot be asked for another learner's course", async () => {
    const h = harness();
    const ada = await h.seed("ada-token", "Thermo", "Week 3", "entropy rises");
    await h.seed("bob-token", "Bob's Thermo", "Week 3", "entropy rises");

    // Bob names Ada's course id. There is no learner argument to forge, so the only thing he
    // can lie about is the course — and the store is keyed by owner.
    const { body } = await h.rpc("bob-token", "tools/call", {
      name: "search_material",
      arguments: { courseId: ada.courseId, query: "entropy" },
    });
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("no such course");
  });

  it("says material is still being read rather than that nothing covers the question", async () => {
    // An import that never finishes, so the material stays in `reading`.
    const stuck = fakeRag({ importFile: () => new Promise<string>(() => {}) });
    const h = harness({ rag: stuck });
    const { courseId } = await h.seed("ada-token", "Thermo", "Week 3", "entropy rises", false);

    const { body } = await h.rpc("ada-token", "tools/call", {
      name: "search_material",
      arguments: { courseId, query: "entropy" },
    });
    expect(body.result.structuredContent.passages).toEqual([]);
    // The distinction that matters: not "nothing covers this", which would be a lie.
    expect(body.result.content[0].text).toContain("still being read");
    expect(body.result.structuredContent.stillReading).toEqual(["week3.pdf"]);
  });

  it("rejects an unknown tool and an unknown method", async () => {
    const h = harness();
    await h.seed("ada-token", "Thermo", "Week 3", "x");

    const tool = await h.rpc("ada-token", "tools/call", { name: "delete_everything" });
    expect(tool.body.error.code).toBe(-32602);

    const method = await h.rpc("ada-token", "nonsense/method");
    expect(method.body.error.code).toBe(-32601);
  });
});

describe("the write gate", () => {
  /** Not registered in TOOLS. It exists to prove the gate, and it records every time it
   *  actually ran so "it ran twice on one grant" is a fact rather than an opinion. */
  function writeTool(): { tool: Tool; runs: JsonObject[] } {
    const runs: JsonObject[] = [];
    const tool: Tool = {
      name: "delete_session",
      title: "Delete a session",
      description: "Removes a session and everything in it.",
      access: "write",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" } },
        required: ["sessionId"],
      },
      async run(args) {
        runs.push(args);
        return { content: [{ type: "text", text: "deleted" }] };
      },
    };
    return { tool, runs };
  }

  it("ships no write tools today", () => {
    // PRD open question 23: nothing in the product can change a learner's material on their
    // behalf yet. When that changes, this test is the thing that says so out loud.
    expect(TOOLS.filter(requiresGrant)).toEqual([]);
  });

  it("refuses a write tool with no grant, and does not run it", async () => {
    const { tool, runs } = writeTool();
    const h = harness({ tools: [...TOOLS, tool] });
    await h.seed("ada-token", "Thermo", "Week 3", "x");

    const { body } = await h.rpc("ada-token", "tools/call", {
      name: "delete_session",
      arguments: { sessionId: "s1" },
    });
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.permissionRequired).toBe(true);
    expect(body.result.structuredContent.grantSignature).toBe(
      signature("delete_session", { sessionId: "s1" }),
    );
    // The thing that matters: it was refused, not merely reported.
    expect(runs).toEqual([]);
  });

  it("runs a write tool when the grant matches the exact call", async () => {
    const { tool, runs } = writeTool();
    const h = harness({ tools: [...TOOLS, tool] });
    await h.seed("ada-token", "Thermo", "Week 3", "x");

    const { body } = await h.rpc("ada-token", "tools/call", {
      name: "delete_session",
      arguments: { sessionId: "s1", _grant: signature("delete_session", { sessionId: "s1" }) },
    });
    expect(body.result.content[0].text).toBe("deleted");
    // The grant is stripped before the tool sees its arguments.
    expect(runs).toEqual([{ sessionId: "s1" }]);
  });

  it("does not let a grant for one call authorise a different one", async () => {
    const { tool, runs } = writeTool();
    const h = harness({ tools: [...TOOLS, tool] });
    await h.seed("ada-token", "Thermo", "Week 3", "x");

    // Agreed to deleting s1; now try s2 with the same grant. This is the whole requirement:
    // an agreement is consent to one act.
    const { body } = await h.rpc("ada-token", "tools/call", {
      name: "delete_session",
      arguments: { sessionId: "s2", _grant: signature("delete_session", { sessionId: "s1" }) },
    });
    expect(body.result.structuredContent.permissionRequired).toBe(true);
    expect(runs).toEqual([]);
  });

  it("cannot be slipped past by reordering the arguments", async () => {
    // A signature over raw JSON would let a client re-serialise its way through the gate.
    expect(signature("t", { a: 1, b: 2 })).toBe(signature("t", { b: 2, a: 1 }));
    expect(signature("t", { a: 1 })).not.toBe(signature("t", { a: 2 }));
    expect(signature("t", { a: 1 })).not.toBe(signature("u", { a: 1 }));
  });

  it("leaves read tools ungated", async () => {
    const h = harness();
    const { courseId } = await h.seed("ada-token", "Thermo", "Week 3", "entropy rises");
    // Twenty reads, no interruption: asking must stay rare, and reading is the ordinary case.
    for (let i = 0; i < 20; i++) {
      const { body } = await h.rpc("ada-token", "tools/call", {
        name: "search_material",
        arguments: { courseId, query: `question ${i}` },
      });
      expect(body.result.structuredContent?.permissionRequired).toBeUndefined();
    }
  });
});

describe("identity", () => {
  it("has no tool that takes a learner id", () => {
    // The one property that makes an agent runtime calling this unable to ask for someone
    // else's material. If a tool ever grows a learner parameter, this fails.
    for (const tool of TOOLS) {
      const props = (tool.inputSchema.properties ?? {}) as JsonObject;
      for (const key of Object.keys(props)) {
        expect(key.toLowerCase()).not.toContain("learner");
        expect(key.toLowerCase()).not.toContain("uid");
      }
    }
  });

  it("reads the caller from the context, so two callers see different material", async () => {
    const store = inMemoryStore();
    const rag = fakeRag();
    const base = { store, rag, topK: 8 };
    const ada: ToolContext = { ...base, learner: "ada" };
    const bob: ToolContext = { ...base, learner: "bob" };

    await store.createLearner({
      id: "ada",
      email: "a@x.test",
      createdAt: "2026-09-29T09:00:00.000Z",
    } as never);
    await store.createCourse({
      id: "c1",
      learner: "ada",
      name: "Thermo",
      createdAt: "2026-09-29T09:00:00.000Z",
    } as never);

    const forAda = await dispatch(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_courses" } },
      ada,
    );
    const forBob = await dispatch(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_courses" } },
      bob,
    );

    const courses = (r: unknown) =>
      (r as { result: { structuredContent: { courses: unknown[] } } }).result.structuredContent
        .courses;
    expect(courses(forAda)).toHaveLength(1);
    expect(courses(forBob)).toHaveLength(0);
  });
});

describe("the Streamable HTTP transport", () => {
  /** The client we must work with is one we did not write, so the negotiation is the risk. */
  const post = (h: ReturnType<typeof harness>, accept: string | null, body: unknown) =>
    h.call("ada-token", MCP_ROUTES.rpc, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        ...(accept === null ? {} : { accept }),
      },
    });

  const init = { jsonrpc: "2.0", id: 1, method: "initialize" };

  it("answers with JSON when the client accepts both", async () => {
    const h = harness();
    // What the reference client sends. JSON is the easier path to debug, so it wins.
    const res = await post(h, "application/json, text/event-stream", init);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { result: { protocolVersion: string } };
    expect(body.result.protocolVersion).toBe("2025-06-18");
  });

  it("answers with an SSE event when the client will not take JSON", async () => {
    const h = harness();
    const res = await post(h, "text/event-stream", init);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text.startsWith("event: message\ndata: ")).toBe(true);
    const payload = JSON.parse(text.slice(text.indexOf("data: ") + 6).trim());
    expect(payload.result.serverInfo.name).toBe("aitutor-material");
  });

  it("returns a session id on initialize and on nothing else", async () => {
    const h = harness();
    const first = await post(h, "application/json", init);
    expect(first.headers.get(SESSION_HEADER)).toBe("session-1");

    const later = await post(h, "application/json", { jsonrpc: "2.0", id: 2, method: "ping" });
    expect(later.headers.get(SESSION_HEADER)).toBeNull();
  });

  it("refuses GET with 405 rather than a confusing 404", async () => {
    const h = harness();
    const res = await h.call("ada-token", MCP_ROUTES.rpc);
    expect(res.status).toBe(405);
  });

  it("accepts DELETE so a client can end a session politely", async () => {
    const h = harness();
    const res = await h.call("ada-token", MCP_ROUTES.rpc, { method: "DELETE" });
    expect(res.status).toBe(204);
  });

  it("answers a batch with an array, and an all-notification batch with 202", async () => {
    const h = harness();
    await h.seed("ada-token", "Thermo", "Week 3", "entropy rises");

    const both = await post(h, "application/json", [
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
    ]);
    const arr = await both.json();
    expect(Array.isArray(arr)).toBe(true);
    // The notification contributes nothing, so two in and two out of three.
    expect(arr).toHaveLength(2);

    const quiet = await post(h, "application/json", [
      { jsonrpc: "2.0", method: "notifications/initialized" },
    ]);
    expect(quiet.status).toBe(202);
    expect(await quiet.text()).toBe("");
  });

  it("reports malformed JSON as a parse error rather than crashing", async () => {
    const h = harness();
    const res = await h.call("ada-token", MCP_ROUTES.rpc, {
      method: "POST",
      body: "{not json",
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(400);
    const parsed = (await res.json()) as { error: { code: number } };
    expect(parsed.error.code).toBe(-32700);
  });
});
