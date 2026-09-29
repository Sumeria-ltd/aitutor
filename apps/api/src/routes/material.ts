import type { Material } from "@aitutor/shared";
import { isAcceptedType, MAX_UPLOAD_BYTES } from "@aitutor/shared";
import type { Hono } from "hono";
import { type AuthedEnv, requireAuth, type TokenVerifier } from "../auth.ts";
import type { Emit } from "../events.ts";
import { type Files, objectKey } from "../files.ts";
import type { Store } from "../firestore.ts";
import type { Rag } from "../rag.ts";

/** Upload material to a session and import it into the learner's RAG corpus — AIT-93.
 *
 *  The learner sees a state (`reading` → `ready` | `failed`) rather than being handed a
 *  thinner answer from material that is not searchable yet (AIT-82). That matters more here
 *  than it would with local indexing: corpus creation takes about twenty seconds and an
 *  import about ten, so `reading` is a real interval, not a formality. */

export type MaterialDeps = {
  store: Store;
  verifier: TokenVerifier;
  files: Files;
  rag: Rag;
  /** Requirement 0010's freshness signal. Optional so a test that does not care about
   *  events need not wire one, and absent means the event is simply not written. */
  emit?: Emit;
  now?: () => Date;
  newId?: () => string;
  /** Awaited in tests so assertions see the finished state; detached in production so the
   *  upload returns at once — capture must not wait on an import (PRD §7). */
  afterResponse?: (work: Promise<unknown>) => void;
};

export const MATERIAL_ROUTES = {
  list: "/api/courses/:courseId/materials",
  upload: "/api/courses/:courseId/sessions/:sessionId/materials",
  one: "/api/courses/:courseId/materials/:materialId",
} as const;

export function mountMaterial(app: Hono<AuthedEnv>, deps: MaterialDeps) {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const detach = deps.afterResponse ?? ((work: Promise<unknown>) => void work.catch(() => {}));
  const authed = requireAuth(deps.verifier);

  app.post(MATERIAL_ROUTES.upload, authed, async (c) => {
    const learner = c.get("learnerId");
    const courseId = c.req.param("courseId");
    const sessionId = c.req.param("sessionId");

    const session = await deps.store.getSession(learner, courseId, sessionId);
    if (!session) return c.json({ error: "not found" }, 404);

    const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    const file = body.file;
    if (!(file instanceof File)) return c.json({ error: "a file is required" }, 400);
    if (file.size === 0) return c.json({ error: "that file is empty" }, 400);
    if (file.size > MAX_UPLOAD_BYTES) {
      return c.json(
        { error: `that file is larger than ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB` },
        400,
      );
    }
    const contentType = file.type || "application/octet-stream";
    if (!isAcceptedType(contentType)) {
      return c.json({ error: `${contentType} is not a file type this can read yet` }, 400);
    }

    const materialId = newId();
    const filename = file.name || "untitled";
    const bytes = new Uint8Array(await file.arrayBuffer());
    // The key carries the file extension — RAG Engine infers the type from it and silently
    // rejects the import without one.
    const gsUri = await deps.files.put(
      objectKey(learner, courseId, materialId, filename),
      bytes,
      contentType,
    );

    const material: Material = {
      id: materialId,
      learner,
      course: courseId,
      session: sessionId,
      filename,
      contentType,
      bytes: file.size,
      gsUri,
      state: "reading",
      chunks: 0,
      createdAt: now().toISOString(),
    };
    await deps.store.createMaterial(material);

    detach(importIntoCorpus(deps, material));
    return c.json({ material }, 202);
  });

  app.get(MATERIAL_ROUTES.list, authed, async (c) => {
    const learner = c.get("learnerId");
    const courseId = c.req.param("courseId");
    const course = await deps.store.getCourse(learner, courseId);
    if (!course) return c.json({ error: "not found" }, 404);
    return c.json({ materials: await deps.store.materialsFor(learner, courseId) });
  });

  app.delete(MATERIAL_ROUTES.one, authed, async (c) => {
    const learner = c.get("learnerId");
    const courseId = c.req.param("courseId");
    const materialId = c.req.param("materialId");
    const material = await deps.store.getMaterial(learner, courseId, materialId);
    if (!material) return c.json({ error: "not found" }, 404);

    // Our own record goes first and synchronously. Retrieval is scoped to the ragFileIds of
    // the materials we still hold, so once this row is gone the document cannot reach an
    // answer even if the corpus has not caught up — which is what lets AIT-95 allow zero
    // retries against a store whose deletes are not instant.
    await deps.store.deleteMaterial(learner, courseId, materialId);

    const owner = await deps.store.getLearner(learner);
    if (owner?.corpus && material.ragFileId) {
      // Best effort, after the record is gone. A ragFile we failed to remove is cost and
      // clutter; it is not reachable, because nothing points at it any more.
      await deps.rag.deleteFile(owner.corpus, material.ragFileId).catch(() => {});
    }
    await deps.files
      .remove(objectKey(learner, courseId, materialId, material.filename))
      .catch(() => {});
    return c.body(null, 204);
  });

  return app;
}

/** Ensure the corpus, import the object, record the ragFile id. Every failure lands on the
 *  material as `failed` with a reason the learner can read — silence is what makes people
 *  conclude a product is broken. */
async function importIntoCorpus(deps: MaterialDeps, material: Material): Promise<void> {
  const { learner, course, id } = material;
  const now = deps.now ?? (() => new Date());
  try {
    const owner = await deps.store.getLearner(learner);
    if (!owner) throw new Error("the learner record disappeared");

    let corpus = owner.corpus;
    if (!corpus) {
      // One corpus per learner, created on first upload. This is the isolation boundary:
      // a retrieval cannot reach another learner's material because it is not in this corpus.
      corpus = await deps.rag.createCorpus(`learner-${learner}`);
      await deps.store.setLearnerCorpus(learner, corpus);
    }

    const ragFileId = await deps.rag.importFile(corpus, material.gsUri);
    const readyAt = now();
    await deps.store.updateMaterial(learner, course, id, {
      state: "ready",
      ragFileId,
      chunks: 1,
      readyAt: readyAt.toISOString(),
    });
    // The five-minute bound in PRD §5 is measured from this pair. The event carries no
    // filename — ADR 0008 forbids a name the learner chose — and no session id, which
    // requirement 0009 has no use for.
    //
    // Outside the try that guards the import, and swallowing its own failure, because
    // **measurement must never be able to fail the thing it measures.** It could, and it
    // did: a PowerPoint's content type is 73 characters against a 64-character attribute
    // cap, so the event threw, the catch below marked a perfectly readable deck `failed`,
    // and the learner was told their file could not be read.
    await emitAnswerable(deps, material, readyAt);
  } catch (cause) {
    await deps.store.updateMaterial(learner, course, id, {
      state: "failed",
      error: cause instanceof Error ? cause.message.slice(0, 300) : "could not read that file",
    });
  }
}

/** ADR 0008 caps an attribute string at 64 characters so a free-text field cannot be
 *  smuggled in as an identifier. A raw MIME type is exactly that kind of thing — Office
 *  types run to 73 characters — so the cap was right and the attribute was wrong. A short
 *  enum is also what requirement 0009 would actually group by. */
function kindOf(contentType: string): string {
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "text/markdown") return "markdown";
  if (contentType.startsWith("text/")) return "text";
  if (contentType.startsWith("image/")) return "image";
  if (contentType.includes("presentationml")) return "pptx";
  if (contentType.includes("wordprocessingml")) return "docx";
  return "other";
}

/** Never throws. The material is already `ready` by the time this runs, and a failure to
 *  record a measurement is not a failure to read the file. */
async function emitAnswerable(deps: MaterialDeps, material: Material, readyAt: Date) {
  try {
    await deps.emit?.("material.became_answerable", material.learner, {
      secondsToReady: Math.round(
        (readyAt.getTime() - new Date(material.createdAt).getTime()) / 1000,
      ),
      bytes: material.bytes,
      kind: kindOf(material.contentType),
    });
  } catch (cause) {
    // Loud enough for the operator alert, invisible to the learner, whose upload worked.
    console.error(
      `material.became_answerable was not recorded: ${cause instanceof Error ? cause.message : cause}`,
    );
  }
}
