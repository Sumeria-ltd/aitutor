import type { Material } from "@aitutor/shared";
import { ROUTES } from "@aitutor/shared";
import { describe, expect, it } from "vitest";
import { fakeVerifier } from "../auth.ts";
import { emitter } from "../events.ts";
import { inMemoryFiles } from "../files.ts";
import { inMemoryStore, type Store } from "../firestore.ts";
import { fakeRag, type Rag, type RagContext } from "../rag.ts";
import { type Ai, fakeAi, parseAnswer } from "../vertex.ts";
import { attribute, mountChat, rankByWords } from "./chat.ts";
import { mountCourses } from "./courses.ts";
import { mountMaterial } from "./material.ts";
import { createApp } from "./me.ts";

const ADA = { uid: "ada", email: "ada@example.test" };
const BOB = { uid: "bob", email: "bob@example.test" };

function harness(opts: { ai?: Ai; rag?: Rag } = {}) {
  const store: Store = inMemoryStore();
  // Advanced by hand so readyAt − createdAt is a fact rather than a race.
  let clock = new Date("2026-09-29T09:00:00.000Z");
  const tick = (seconds: number) => {
    clock = new Date(clock.getTime() + seconds * 1000);
  };
  const files = inMemoryFiles();
  const rag = opts.rag ?? fakeRag();
  const ai =
    opts.ai ??
    fakeAi({
      // Cites the first document it was handed, so attribution is exercised for real.
      async answer(input) {
        const first = input.chunks[0];
        if (!first) return { text: "not covered", cited: [], covered: false };
        return {
          text: `From ${first.sessionTitle}: ${first.text.slice(0, 40)}`,
          cited: [1],
          covered: true,
        };
      },
    });
  const verifier = fakeVerifier({ "ada-token": ADA, "bob-token": BOB });
  let n = 0;
  const newId = () => `id-${++n}`;
  const pending: Promise<unknown>[] = [];

  const app = createApp({ store, verifier });
  // rag and files so a container deletion frees the bytes, not only the records (spec 0010).
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
  mountChat(app, { store, verifier, ai, rag });

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
    // The learner record has to exist: the corpus name is recorded on it.
    await call(token, ROUTES.session, {
      method: "POST",
      body: JSON.stringify({ idToken: token }),
      headers: { "content-type": "application/json" },
    });
    const { course } = (await (
      await json(token, ROUTES.courses, "POST", { name: courseName })
    ).json()) as { course: { id: string } };
    const { session } = (await (
      await json(token, `/api/courses/${course.id}/sessions`, "POST", { title: sessionTitle })
    ).json()) as { session: { id: string } };

    const form = new FormData();
    form.set("file", new File([text], "week3.pdf", { type: "application/pdf" }));
    const up = await call(token, `/api/courses/${course.id}/sessions/${session.id}/materials`, {
      method: "POST",
      body: form,
    });
    await Promise.all(pending);
    return { courseId: course.id, sessionId: session.id, uploadStatus: up.status };
  }

  const materials = async (token: string, courseId: string) =>
    (
      (await (await call(token, `/api/courses/${courseId}/materials`)).json()) as {
        materials: Material[];
      }
    ).materials;

  return { store, files, rag, call, json, seed, materials, tick };
}

describe("upload into the learner's corpus", () => {
  it("creates one corpus, imports the file, and records its ragFileId", async () => {
    const h = harness();
    const { courseId, uploadStatus } = await h.seed("ada-token", "Thermo", "Week 3 — entropy", "x");
    expect(uploadStatus).toBe(202);

    const [m] = await h.materials("ada-token", courseId);
    expect(m?.state).toBe("ready");
    expect(m?.ragFileId).toBeTruthy();

    const learner = await h.store.getLearner("ada");
    expect(learner?.corpus).toContain("ragCorpora/");
  });

  it("stores the object under a key that keeps the file extension", async () => {
    // Not cosmetic: RAG Engine infers the file type from the extension and rejects an import
    // without one, reporting success with failedRagFilesCount=1.
    const h = harness();
    await h.seed("ada-token", "Thermo", "Week 1", "x");
    expect(h.files.held().every((k) => k.endsWith(".pdf"))).toBe(true);
  });

  it("marks material failed with the reason when the import is rejected", async () => {
    const h = harness({
      rag: fakeRag({
        async importFile() {
          throw new Error("import produced no file (imported=0, failed=1)");
        },
      }),
    });
    const { courseId } = await h.seed("ada-token", "Thermo", "Week 1", "x");
    const [m] = await h.materials("ada-token", courseId);
    expect(m?.state).toBe("failed");
    expect(m?.error).toContain("failed=1");
  });

  it("will not upload into another learner's session", async () => {
    const h = harness();
    const { courseId, sessionId } = await h.seed("ada-token", "Ada's", "Week 1", "x");
    const form = new FormData();
    form.set("file", new File(["x"], "x.pdf", { type: "application/pdf" }));
    const res = await h.call(
      "bob-token",
      `/api/courses/${courseId}/sessions/${sessionId}/materials`,
      { method: "POST", body: form },
    );
    expect(res.status).toBe(404);
  });
});

describe("chat", () => {
  it("answers from the learner's material and names the session and file", async () => {
    const h = harness();
    const { courseId } = await h.seed("ada-token", "Thermo", "Week 3 — entropy", "entropy");
    const res = await h.json("ada-token", `/api/courses/${courseId}/chat`, "POST", {
      message: "what did we say about entropy",
    });
    expect(res.status).toBe(200);
    const { answer } = (await res.json()) as {
      answer: { covered: boolean; citations: { sessionTitle: string; filename: string }[] };
    };
    expect(answer.covered).toBe(true);
    expect(answer.citations[0]?.sessionTitle).toBe("Week 3 — entropy");
    expect(answer.citations[0]?.filename).toBe("week3.pdf");
  });

  it("says so plainly when the course has no material", async () => {
    const h = harness();
    const { course } = (await (
      await h.json("ada-token", ROUTES.courses, "POST", { name: "Empty" })
    ).json()) as { course: { id: string } };
    const res = await h.json("ada-token", `/api/courses/${course.id}/chat`, "POST", {
      message: "anything?",
    });
    const { answer } = (await res.json()) as { answer: { covered: boolean; citations: unknown[] } };
    expect(answer.covered).toBe(false);
    expect(answer.citations).toEqual([]);
  });

  it("requires a question, and a course the learner owns", async () => {
    const h = harness();
    const { courseId } = await h.seed("ada-token", "Ada's", "Week 1", "x");
    expect(
      (await h.json("ada-token", `/api/courses/${courseId}/chat`, "POST", { message: " " })).status,
    ).toBe(400);
    expect(
      (await h.json("bob-token", `/api/courses/${courseId}/chat`, "POST", { message: "hi" }))
        .status,
    ).toBe(404);
  });

  // AIT-96 — the demo's one non-negotiable. One corpus per learner is the boundary: Bob's
  // retrieval runs against Bob's corpus, which does not contain Ada's file at all.
  it("searches only the asking learner's corpus", async () => {
    const h = harness();
    await h.seed("ada-token", "Ada's Thermo", "Week 3 — entropy", "entropy isolated system");
    const bob = await h.seed("bob-token", "Bob's ML", "Bob week 1", "gradient descent");

    const ada = await h.store.getLearner("ada");
    const bobL = await h.store.getLearner("bob");
    expect(ada?.corpus).toBeTruthy();
    expect(ada?.corpus).not.toBe(bobL?.corpus);

    const res = await h.json("bob-token", `/api/courses/${bob.courseId}/chat`, "POST", {
      message: "entropy isolated system",
    });
    const { answer } = (await res.json()) as { answer: { citations: { sessionTitle: string }[] } };
    expect(answer.citations.every((c) => c.sessionTitle !== "Week 3 — entropy")).toBe(true);
  });

  // AIT-95 — our record goes first, and retrieval is scoped to the records we still hold, so
  // the document is unreachable on the next question even if the corpus lags.
  it("stops answering from a document the moment it is deleted", async () => {
    const h = harness();
    const { courseId } = await h.seed("ada-token", "Thermo", "Week 3 — entropy", "entropy");
    const ask = () =>
      h.json("ada-token", `/api/courses/${courseId}/chat`, "POST", { message: "entropy" });

    expect(((await (await ask()).json()) as { answer: { covered: boolean } }).answer.covered).toBe(
      true,
    );

    const [m] = await h.materials("ada-token", courseId);
    const del = await h.call("ada-token", `/api/courses/${courseId}/materials/${m?.id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(204);

    const after = (await (await ask()).json()) as {
      answer: { covered: boolean; citations: unknown[] };
    };
    expect(after.answer.covered).toBe(false);
    expect(after.answer.citations).toEqual([]);
  });

  // Belt and braces on the same guarantee: even if the corpus returns a deleted file's chunks,
  // a context whose gs:// URI matches no material we hold cannot become an answer.
  it("withholds rather than quietly dropping a context we do not hold", async () => {
    // Changed for spec 0010. This used to assert that a foreign context was silently
    // filtered out and an empty answer returned — which is a leak nobody hears about.
    // retrieveFor now throws IsolationFault, the request fails, and no answer is shown.
    const h = harness({
      rag: fakeRag({
        async retrieve() {
          return [{ sourceUri: "gs://bucket/deleted.pdf", text: "stale", score: 1 }];
        },
      }),
    });
    const { courseId } = await h.seed("ada-token", "Thermo", "Week 1", "x");
    const res = await h.json("ada-token", `/api/courses/${courseId}/chat`, "POST", {
      message: "anything",
    });
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type") ?? "").not.toContain("application/json");
  });

  it("says the material is still being read rather than that nothing covers it", async () => {
    const h = harness();
    const { courseId, sessionId } = await h.seed("ada-token", "Thermo", "Week 1", "x");
    // A second material that never finished importing. Nothing is ready, so the old code
    // said "nothing covers that yet" — a different fact, and the wrong one.
    await h.store.createMaterial({
      id: "m-reading",
      learner: "ada",
      course: courseId,
      session: sessionId,
      filename: "week-two.pdf",
      contentType: "application/pdf",
      bytes: 1,
      gsUri: "gs://b/week-two.pdf",
      state: "reading",
      chunks: 0,
      createdAt: "2026-09-29T09:00:00.000Z",
    });
    // Remove the one that did import, so nothing is ready and the only material the
    // learner has is still being read.
    const held = await h.materials("ada-token", courseId);
    for (const m of held.filter((x) => x.state === "ready")) {
      await h.store.deleteMaterial("ada", courseId, m.id);
    }

    const res = await h.json("ada-token", `/api/courses/${courseId}/chat`, "POST", {
      message: "anything",
    });
    const { answer } = (await res.json()) as {
      answer: { text: string; covered: boolean; pending?: { filename: string }[] };
    };
    expect(answer.covered).toBe(false);
    expect(answer.text).toMatch(/still being read/);
    expect(answer.pending).toEqual([{ filename: "week-two.pdf" }]);
  });
});

describe("freshness is measurable, not asserted", () => {
  it("records readyAt and emits material.became_answerable with the seconds it took", async () => {
    const h = harness();
    // The import takes time; readyAt − createdAt is what PRD §5's five-minute bound reads.
    const { courseId } = await h.seed("ada-token", "Thermo", "Week 1", "indexes in week three");

    const held = await h.materials("ada-token", courseId);
    const ready = held.find((m) => m.state === "ready");
    expect(ready?.readyAt, "a ready material with no readyAt cannot be measured").toBeTruthy();
    expect(new Date(ready?.readyAt as string).getTime()).toBeGreaterThanOrEqual(
      new Date(ready?.createdAt as string).getTime(),
    );

    const events = await h.store.eventsFor("ada");
    const emitted = events.find((e) => e.name === "material.became_answerable");
    expect(emitted, "requirement 0009 gets no freshness signal without this").toBeTruthy();
    expect(emitted?.requirement).toBe("0010");
    expect(typeof emitted?.attributes.secondsToReady).toBe("number");
    // ADR 0008: no filename the learner chose, no prose, nothing but scalars.
    expect(Object.keys(emitted?.attributes ?? {}).sort()).toEqual([
      "bytes",
      "contentType",
      "secondsToReady",
    ]);
  });
});

describe("deleting a container frees the bytes, not only the records", () => {
  /** fakeRag keeps no record of what it deleted, so the probe for it is here. */
  function watched() {
    const deleted: string[] = [];
    const base = fakeRag();
    return {
      deleted,
      rag: fakeRag({
        importFile: base.importFile,
        retrieve: base.retrieve,
        async deleteFile(corpus, ragFileId) {
          deleted.push(ragFileId);
          await base.deleteFile(corpus, ragFileId);
        },
      }),
    };
  }

  it("removes the ragFile and the object when a session goes", async () => {
    const w = watched();
    const h = harness({ rag: w.rag });
    const { courseId, sessionId } = await h.seed("ada-token", "Thermo", "Week 1", "x");
    const held = await h.materials("ada-token", courseId);
    const victim = held.find((m) => m.state === "ready");
    expect(victim?.ragFileId).toBeTruthy();

    const res = await h.call("ada-token", `/api/courses/${courseId}/sessions/${sessionId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);

    // The record is gone, which is what the acceptance line counts...
    expect(await h.materials("ada-token", courseId)).toEqual([]);
    // ...and so are the bytes, which is what the learner was actually promised.
    expect(w.deleted).toEqual([victim?.ragFileId]);
    expect(h.files.held()).toEqual([]);
  });

  it("removes them when a whole course goes", async () => {
    const w = watched();
    const h = harness({ rag: w.rag });
    const { courseId } = await h.seed("ada-token", "Thermo", "Week 1", "x");

    const res = await h.call("ada-token", `/api/courses/${courseId}`, { method: "DELETE" });
    expect(res.status).toBe(204);

    expect(w.deleted).toHaveLength(1);
    expect(h.files.held()).toEqual([]);
  });

  it("answers nothing from a session deleted a moment ago, with zero retries", async () => {
    const h = harness();
    const { courseId, sessionId } = await h.seed("ada-token", "Thermo", "Week 1", "indexes");
    await h.call("ada-token", `/api/courses/${courseId}/sessions/${sessionId}`, {
      method: "DELETE",
    });

    // The very next request. No sleep, no retry.
    const res = await h.json("ada-token", `/api/courses/${courseId}/chat`, "POST", {
      message: "what about indexes?",
    });
    const { answer } = (await res.json()) as { answer: { covered: boolean; citations: unknown[] } };
    expect(answer.covered).toBe(false);
    expect(answer.citations).toEqual([]);
  });
});

describe("the citation invariant", () => {
  const m1: Material = {
    id: "m1",
    learner: "ada",
    course: "c1",
    session: "s1",
    filename: "m1.pdf",
    contentType: "application/pdf",
    bytes: 1,
    gsUri: "gs://b/m1.pdf",
    state: "ready",
    ragFileId: "rf-m1",
    chunks: 1,
    createdAt: "2026-09-26T00:00:00.000Z",
  };
  const used: RagContext[] = [{ sourceUri: m1.gsUri, text: "t", score: 1 }];
  const byUri = new Map([[m1.gsUri, m1]]);
  const titles = new Map([["s1", "Week 1"]]);

  it("drops labels that were never sent", () => {
    const out = attribute(
      { text: "an answer", cited: [1, 99, 0, -3], covered: true },
      used,
      byUri,
      titles,
    );
    expect(out.citations).toEqual([
      { session: "s1", sessionTitle: "Week 1", material: "m1", filename: "m1.pdf" },
    ]);
  });

  it("withholds an answer that claims grounding but cites nothing verifiable", () => {
    const out = attribute(
      { text: "confident nonsense", cited: [42], covered: true },
      used,
      byUri,
      titles,
    );
    expect(out.covered).toBe(false);
    expect(out.citations).toEqual([]);
    expect(out.text).not.toContain("confident nonsense");
  });

  it("does not repeat the same session and document twice", () => {
    const first = used[0] as RagContext;
    const out = attribute(
      { text: "a", cited: [1, 2], covered: true },
      [first, first],
      byUri,
      titles,
    );
    expect(out.citations).toHaveLength(1);
  });
});

describe("the keyword half of hybrid retrieval", () => {
  it("promotes a chunk that literally contains the asked words", () => {
    const contexts: RagContext[] = [
      { sourceUri: "a", text: "unrelated prose about cooking", score: 0.6 },
      { sourceUri: "b", text: "a covering index answers an index-only scan", score: 0.55 },
    ];
    expect(rankByWords(contexts, "covering index scan")[0]?.sourceUri).toBe("b");
  });
});

describe("parseAnswer", () => {
  it("reads a well-formed reply, fenced or not", () => {
    expect(parseAnswer('{"covered":true,"cited":[2],"text":"hello"}')).toEqual({
      covered: true,
      cited: [2],
      text: "hello",
    });
    expect(parseAnswer('```json\n{"covered":false,"cited":[],"text":"nope"}\n```').covered).toBe(
      false,
    );
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
