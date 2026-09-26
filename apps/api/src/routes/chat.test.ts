import type { Retrieved } from "@aitutor/shared";
import { ROUTES } from "@aitutor/shared";
import { describe, expect, it } from "vitest";
import { fakeVerifier } from "../auth.ts";
import { inMemoryFiles } from "../files.ts";
import { inMemoryStore, type Store } from "../firestore.ts";
import { type Ai, fakeAi, parseAnswer } from "../vertex.ts";
import { attribute, mountChat } from "./chat.ts";
import { mountCourses } from "./courses.ts";
import { mountMaterial } from "./material.ts";
import { createApp } from "./me.ts";

const ADA = { uid: "ada", email: "ada@example.test" };
const BOB = { uid: "bob", email: "bob@example.test" };

function harness(ai: Ai = fakeAi()) {
  const store: Store = inMemoryStore();
  const files = inMemoryFiles();
  const verifier = fakeVerifier({ "ada-token": ADA, "bob-token": BOB });
  let n = 0;
  const newId = () => `id-${++n}`;
  // Indexing is awaited here so assertions see the finished state; production detaches it.
  const pending: Promise<unknown>[] = [];

  const app = createApp({ store, verifier });
  mountCourses(app, { store, verifier, newId });
  mountMaterial(app, {
    store,
    verifier,
    files,
    ai,
    newId,
    afterResponse: (w) => pending.push(w),
  });
  mountChat(app, { store, verifier, ai });

  const call = (token: string | null, path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    });

  const json = (token: string, path: string, method: string, body: unknown) =>
    call(token, path, {
      method,
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });

  async function seed(token: string, courseName: string, sessionTitle: string, text: string) {
    const course = (await (
      await json(token, ROUTES.courses, "POST", { name: courseName })
    ).json()) as {
      course: { id: string };
    };
    const session = (await (
      await json(token, `/api/courses/${course.course.id}/sessions`, "POST", {
        title: sessionTitle,
      })
    ).json()) as { session: { id: string } };

    const form = new FormData();
    form.set("file", new File([text], "lecture4.pdf", { type: "text/plain" }));
    const up = await call(
      token,
      `/api/courses/${course.course.id}/sessions/${session.session.id}/materials`,
      {
        method: "POST",
        body: form,
      },
    );
    await Promise.all(pending);
    return { courseId: course.course.id, sessionId: session.session.id, uploadStatus: up.status };
  }

  return { store, files, call, json, seed, settle: () => Promise.all(pending) };
}

const ENTROPY = "Entropy in an isolated system never decreases. This is the second law.";

describe("upload and indexing", () => {
  it("accepts a file, reports it ready, and makes it answerable", async () => {
    const h = harness();
    const { courseId, uploadStatus } = await h.seed(
      "ada-token",
      "Thermo",
      "Week 3 — entropy",
      ENTROPY,
    );
    expect(uploadStatus).toBe(202);

    const materials = (await (
      await h.call("ada-token", `/api/courses/${courseId}/materials`)
    ).json()) as {
      materials: { state: string; chunks: number; filename: string }[];
    };
    expect(materials.materials[0]?.state).toBe("ready");
    expect(materials.materials[0]?.chunks).toBeGreaterThan(0);
    expect(materials.materials[0]?.filename).toBe("lecture4.pdf");
  });

  it("rejects an unreadable type and an empty file", async () => {
    const h = harness();
    const { courseId, sessionId } = await h.seed("ada-token", "Thermo", "Week 1", ENTROPY);
    const path = `/api/courses/${courseId}/sessions/${sessionId}/materials`;

    const exe = new FormData();
    exe.set("file", new File(["MZ"], "virus.exe", { type: "application/x-msdownload" }));
    expect((await h.call("ada-token", path, { method: "POST", body: exe })).status).toBe(400);

    const empty = new FormData();
    empty.set("file", new File([], "nothing.txt", { type: "text/plain" }));
    expect((await h.call("ada-token", path, { method: "POST", body: empty })).status).toBe(400);
  });

  it("marks material failed with a reason when reading throws, rather than going quiet", async () => {
    const h = harness(
      fakeAi({
        async embed() {
          throw new Error("embedding service unavailable");
        },
      }),
    );
    const { courseId } = await h.seed("ada-token", "Thermo", "Week 1", ENTROPY);
    const materials = (await (
      await h.call("ada-token", `/api/courses/${courseId}/materials`)
    ).json()) as {
      materials: { state: string; error?: string }[];
    };
    expect(materials.materials[0]?.state).toBe("failed");
    expect(materials.materials[0]?.error).toContain("embedding service unavailable");
  });

  it("will not upload into another learner's session", async () => {
    const h = harness();
    const { courseId, sessionId } = await h.seed("ada-token", "Ada's", "Week 1", ENTROPY);
    const form = new FormData();
    form.set("file", new File([ENTROPY], "x.txt", { type: "text/plain" }));
    const res = await h.call(
      "bob-token",
      `/api/courses/${courseId}/sessions/${sessionId}/materials`,
      {
        method: "POST",
        body: form,
      },
    );
    expect(res.status).toBe(404);
  });
});

describe("chat", () => {
  it("answers from the learner's material and names the session and file", async () => {
    const h = harness();
    const { courseId } = await h.seed("ada-token", "Thermo", "Week 3 — entropy", ENTROPY);
    const res = await h.json("ada-token", `/api/courses/${courseId}/chat`, "POST", {
      message: "what did we say about entropy",
    });
    expect(res.status).toBe(200);
    const { answer } = (await res.json()) as {
      answer: { covered: boolean; citations: { sessionTitle: string; filename: string }[] };
    };
    expect(answer.covered).toBe(true);
    expect(answer.citations[0]?.sessionTitle).toBe("Week 3 — entropy");
    expect(answer.citations[0]?.filename).toBe("lecture4.pdf");
  });

  it("says so plainly when there is no material at all", async () => {
    const h = harness();
    const course = (await (
      await h.json("ada-token", ROUTES.courses, "POST", { name: "Empty" })
    ).json()) as {
      course: { id: string };
    };
    const res = await h.json("ada-token", `/api/courses/${course.course.id}/chat`, "POST", {
      message: "anything?",
    });
    const { answer } = (await res.json()) as { answer: { covered: boolean; citations: unknown[] } };
    expect(answer.covered).toBe(false);
    expect(answer.citations).toEqual([]);
  });

  it("requires a question, and a course the learner owns", async () => {
    const h = harness();
    const { courseId } = await h.seed("ada-token", "Ada's", "Week 1", ENTROPY);
    expect(
      (await h.json("ada-token", `/api/courses/${courseId}/chat`, "POST", { message: "  " }))
        .status,
    ).toBe(400);
    expect(
      (await h.json("bob-token", `/api/courses/${courseId}/chat`, "POST", { message: "hi" }))
        .status,
    ).toBe(404);
  });

  // AIT-96 — the demo's one non-negotiable, at the layer where it would actually leak.
  it("never draws on another learner's material, even for the same question", async () => {
    const h = harness();
    await h.seed("ada-token", "Ada's Thermo", "Week 3 — entropy", ENTROPY);
    const bob = await h.seed(
      "bob-token",
      "Bob's Thermo",
      "Bob week 1",
      "Bob's notes about gradient descent.",
    );

    const res = await h.json("bob-token", `/api/courses/${bob.courseId}/chat`, "POST", {
      message: "what did we say about entropy",
    });
    const { answer } = (await res.json()) as {
      answer: { covered: boolean; citations: { sessionTitle: string }[] };
    };
    // Bob has nothing about entropy. He must be told so, not handed Ada's material.
    expect(answer.citations.every((c) => c.sessionTitle !== "Week 3 — entropy")).toBe(true);
  });

  // AIT-95 — deletion is immediate, with zero retries.
  it("stops answering from a document the moment it is deleted", async () => {
    const h = harness();
    const { courseId } = await h.seed("ada-token", "Thermo", "Week 3 — entropy", ENTROPY);
    const ask = () =>
      h.json("ada-token", `/api/courses/${courseId}/chat`, "POST", {
        message: "entropy isolated system",
      });

    const before = (await (await ask()).json()) as { answer: { covered: boolean } };
    expect(before.answer.covered).toBe(true);

    const materials = (await (
      await h.call("ada-token", `/api/courses/${courseId}/materials`)
    ).json()) as {
      materials: { id: string }[];
    };
    const del = await h.call(
      "ada-token",
      `/api/courses/${courseId}/materials/${materials.materials[0]?.id}`,
      {
        method: "DELETE",
      },
    );
    expect(del.status).toBe(204);

    // The very next question, no retries, no waiting.
    const after = (await (await ask()).json()) as {
      answer: { covered: boolean; citations: unknown[] };
    };
    expect(after.answer.covered).toBe(false);
    expect(after.answer.citations).toEqual([]);
    expect(h.files.held()).toEqual([]);
  });
});

// The citation invariant, tested directly. CLAUDE.md: a citation the retriever never
// supplied is a fabrication, and an answer we cannot attribute is not shown.
describe("attribute", () => {
  const chunk = (session: string, material: string): Retrieved => ({
    id: `${material}-0`,
    learner: "ada",
    course: "c1",
    session,
    material,
    text: "text",
    embedding: [],
    score: 1,
    similarity: 1,
    keyword: 0,
  });
  const names = {
    sessions: new Map([["s1", "Week 1"]]),
    materials: new Map([["m1", "one.pdf"]]),
  };

  it("drops labels that were never sent", () => {
    const out = attribute(
      { text: "an answer", cited: [1, 99, 0, -3], covered: true },
      [chunk("s1", "m1")],
      names,
    );
    expect(out.citations).toEqual([
      { session: "s1", sessionTitle: "Week 1", material: "m1", filename: "one.pdf" },
    ]);
  });

  it("withholds an answer that claims grounding but cites nothing verifiable", () => {
    const out = attribute(
      { text: "confident nonsense", cited: [42], covered: true },
      [chunk("s1", "m1")],
      names,
    );
    expect(out.covered).toBe(false);
    expect(out.citations).toEqual([]);
    expect(out.text).not.toContain("confident nonsense");
  });

  it("does not repeat the same session and document twice", () => {
    const out = attribute(
      { text: "a", cited: [1, 2], covered: true },
      [chunk("s1", "m1"), chunk("s1", "m1")],
      names,
    );
    expect(out.citations).toHaveLength(1);
  });
});

describe("parseAnswer", () => {
  it("reads a well-formed reply, fenced or not", () => {
    expect(parseAnswer('{"covered":true,"cited":[2],"text":"hello"}')).toEqual({
      covered: true,
      cited: [2],
      text: "hello",
    });
    expect(
      parseAnswer('```json\n{"covered":false,"cited":[],"text":"not covered"}\n```').covered,
    ).toBe(false);
  });

  it("treats an unparseable reply as not covered rather than showing it", () => {
    const out = parseAnswer("I'm afraid I can't do that");
    expect(out.covered).toBe(false);
    expect(out.cited).toEqual([]);
  });

  it("drops citations from a reply that says it is not covered", () => {
    expect(parseAnswer('{"covered":false,"cited":[1,2],"text":"nope"}').cited).toEqual([]);
  });
});
