import type { Material } from "@aitutor/shared";
import { describe, expect, it } from "vitest";
import { inMemoryStore } from "./firestore.ts";
import { fakeRag, type RagContext } from "./rag.ts";
import { IsolationFault, type ReadableSet, readableSet, retrieveFor } from "./readable.ts";

const material = (over: Partial<Material> = {}): Material => ({
  id: "m1",
  learner: "learner-a",
  course: "c1",
  session: "s1",
  filename: "week-one.pdf",
  contentType: "application/pdf",
  bytes: 10,
  gsUri: "gs://bucket/learner-a/c1/m1.pdf",
  state: "ready",
  ragFileId: "file-1",
  chunks: 1,
  createdAt: "2026-09-29T09:00:00.000Z",
  ...over,
});

async function storeWith(materials: Material[], corpus: string | null = "corpus-a") {
  const store = inMemoryStore();
  await store.createLearner({
    id: "learner-a",
    email: "a@example.com",
    createdAt: "2026-09-29T08:00:00.000Z",
    ...(corpus ? { corpus } : {}),
  });
  await store.createCourse({
    id: "c1",
    learner: "learner-a",
    name: "Thermodynamics",
    createdAt: "2026-09-29T08:00:00.000Z",
  });
  for (const m of materials) await store.createMaterial(m);
  return store;
}

const setOf = (over: Partial<ReadableSet> = {}): ReadableSet => ({
  corpus: "corpus-a",
  allow: [{ ragFileId: "file-1", material: material() }],
  pending: [],
  failed: [],
  ...over,
});

describe("readableSet", () => {
  it("allows only material that is ready and carries a ragFile id", async () => {
    const store = await storeWith([
      material({ id: "m1", ragFileId: "file-1" }),
      material({ id: "m2", state: "reading", ragFileId: undefined, filename: "week-two.pdf" }),
      material({ id: "m3", state: "failed", ragFileId: undefined, filename: "broken.pdf" }),
      // Ready, but the import never recorded an id. Not retrievable, and it must not be
      // silently treated as if it were.
      material({ id: "m4", state: "ready", ragFileId: undefined, filename: "half.pdf" }),
    ]);

    const set = await readableSet(store, "learner-a", "c1");

    expect(set.allow.map((a) => a.ragFileId)).toEqual(["file-1"]);
    expect(set.pending.map((m) => m.filename)).toEqual(["week-two.pdf"]);
    expect(set.failed.map((m) => m.filename)).toEqual(["broken.pdf", "half.pdf"]);
  });

  it("returns no corpus when the learner has none yet", async () => {
    const store = await storeWith([material()], null);
    const set = await readableSet(store, "learner-a", "c1");
    expect(set.corpus).toBe("");
    expect(set.allow).toEqual([]);
  });

  it("never reaches another learner's material, even with a matching course id", async () => {
    const store = await storeWith([material()]);
    await store.createMaterial(material({ id: "m9", learner: "learner-b", ragFileId: "file-9" }));

    const set = await readableSet(store, "learner-a", "c1");

    expect(set.allow.map((a) => a.ragFileId)).toEqual(["file-1"]);
  });
});

describe("retrieveFor", () => {
  it("refuses an empty allow-list rather than searching the corpus", async () => {
    let called = false;
    const rag = fakeRag({
      async retrieve() {
        called = true;
        return [];
      },
    });

    const got = await retrieveFor(rag, setOf({ allow: [] }), "indexes", 8);

    expect(got).toEqual([]);
    expect(called).toBe(false);
  });

  it("throws IsolationFault when a context does not belong to the caller", async () => {
    const foreign: RagContext = {
      sourceUri: "gs://bucket/learner-b/c1/m9.pdf",
      text: "someone else's notes",
      score: 0.9,
    };
    const rag = fakeRag({
      async retrieve() {
        return [foreign];
      },
    });

    await expect(retrieveFor(rag, setOf(), "indexes", 8)).rejects.toBeInstanceOf(IsolationFault);
  });

  it("does not silently drop a foreign context — it reports which one", async () => {
    const rag = fakeRag({
      async retrieve() {
        return [
          { sourceUri: "gs://bucket/learner-a/c1/m1.pdf", text: "mine", score: 0.9 },
          { sourceUri: "gs://bucket/learner-b/c1/m9.pdf", text: "theirs", score: 0.8 },
        ];
      },
    });

    await expect(retrieveFor(rag, setOf(), "indexes", 8)).rejects.toThrow(/learner-b/);
  });

  it("returns every context when they all belong to the caller", async () => {
    const rag = fakeRag({
      async retrieve() {
        return [{ sourceUri: "gs://bucket/learner-a/c1/m1.pdf", text: "mine", score: 0.9 }];
      },
    });

    const got = await retrieveFor(rag, setOf(), "indexes", 8);

    expect(got).toHaveLength(1);
    expect(got[0]?.text).toBe("mine");
  });
});
