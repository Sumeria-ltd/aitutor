import type { Chunk, Material } from "@aitutor/shared";
import { chunkText, isAcceptedType, MAX_UPLOAD_BYTES } from "@aitutor/shared";
import type { Hono } from "hono";
import { type AuthedEnv, requireAuth, type TokenVerifier } from "../auth.ts";
import { type Files, objectKey } from "../files.ts";
import type { Store } from "../firestore.ts";
import type { Ai } from "../vertex.ts";

/** Upload material to a session and make it searchable — AIT-93.
 *
 *  The learner is told the state (`reading` → `ready` | `failed`) rather than being given
 *  a thinner answer from material that is not searchable yet (AIT-82). Reading happens
 *  after the response, so the upload itself returns immediately — capture must not wait on
 *  a model call (PRD §7, and requirement 0004's two-minute phone capture). */

export type MaterialDeps = {
  store: Store;
  verifier: TokenVerifier;
  files: Files;
  ai: Ai;
  now?: () => Date;
  newId?: () => string;
  /** Awaited in tests so assertions see the finished state; left un-awaited in production
   *  so the learner is not held up. */
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

    // The session must exist and be this learner's. Uploading to someone else's session
    // is indistinguishable from uploading to one that does not exist.
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
    const bytes = new Uint8Array(await file.arrayBuffer());
    const gsUri = await deps.files.put(
      objectKey(learner, courseId, materialId),
      bytes,
      contentType,
    );

    const material: Material = {
      id: materialId,
      learner,
      course: courseId,
      session: sessionId,
      filename: file.name || "untitled",
      contentType,
      bytes: file.size,
      gsUri,
      state: "reading",
      chunks: 0,
      createdAt: now().toISOString(),
    };
    await deps.store.createMaterial(material);

    detach(readAndIndex(deps, material, bytes));
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
    // Chunks and the record go first, so the material stops being answerable before the
    // response is sent. The stored file goes after: an orphaned object costs pennies, an
    // answer quoting a deleted document costs the product's credibility (AIT-95).
    await deps.store.deleteMaterial(learner, courseId, materialId);
    await deps.files.remove(objectKey(learner, courseId, materialId));
    return c.body(null, 204);
  });

  return app;
}

/** Extract → chunk → embed → store. Every failure lands on the material as `failed` with a
 *  reason, because a learner who is told nothing concludes the product is broken. */
async function readAndIndex(
  deps: MaterialDeps,
  material: Material,
  bytes: Uint8Array,
): Promise<void> {
  const { learner, course, session, id } = material;
  try {
    const text = material.contentType.startsWith("text/")
      ? new TextDecoder().decode(bytes)
      : await deps.ai.extractText(material.gsUri, material.contentType);

    const pieces = chunkText(text);
    if (pieces.length === 0) {
      await deps.store.updateMaterial(learner, course, id, {
        state: "failed",
        error: "no readable text was found in that file",
      });
      return;
    }

    const embeddings = await deps.ai.embed(pieces, "document");
    const chunks: Chunk[] = pieces.map((piece, i) => ({
      id: `${id}-${i}`,
      learner,
      course,
      session,
      material: id,
      text: piece,
      embedding: embeddings[i] ?? [],
    }));
    await deps.store.putChunks(chunks);
    await deps.store.updateMaterial(learner, course, id, {
      state: "ready",
      chunks: chunks.length,
    });
  } catch (cause) {
    await deps.store.updateMaterial(learner, course, id, {
      state: "failed",
      error: cause instanceof Error ? cause.message.slice(0, 200) : "could not read that file",
    });
  }
}
