import type { Answer, ChatTurn, Citation, Material } from "@aitutor/shared";
import { keywordScore } from "@aitutor/shared";
import type { Hono } from "hono";
import { type AuthedEnv, requireAuth, type TokenVerifier } from "../auth.ts";
import type { Store } from "../firestore.ts";
import type { Rag, RagContext } from "../rag.ts";
import type { Ai, LabelledChunk } from "../vertex.ts";

/** The chat — AIT-94. Multi-turn, answers only from the asking learner's own material,
 *  retrieved from their Vertex AI RAG Engine corpus, and every answer names the session it
 *  drew from.
 *
 *  Two boundaries, both structural rather than checked:
 *  - The corpus searched is the corpus recorded on the learner making the request. Another
 *    learner's material is not in it.
 *  - Retrieval is scoped to the ragFileIds of the materials we still hold for *this course*.
 *    So a document deleted a moment ago cannot be retrieved even if the corpus has not caught
 *    up, and another course's material is not searched.
 *
 *  The citation invariant lives here, in our code (CLAUDE.md). The model sees chunks labelled
 *  "Document 1..n" and cites by label; it never sees a session id and so cannot invent one. A
 *  label outside the set we sent is dropped, and an answer claiming to be grounded with no
 *  surviving citation is withheld rather than shown. */

export type ChatDeps = {
  store: Store;
  verifier: TokenVerifier;
  ai: Ai;
  rag: Rag;
  topK?: number;
};

export const CHAT_ROUTES = { ask: "/api/courses/:courseId/chat" } as const;

const NOTHING_YET =
  "Nothing in this course's material covers that yet. If you have a handout or slides about it, add them to the session they belong to and ask again.";

export function mountChat(app: Hono<AuthedEnv>, deps: ChatDeps) {
  const topK = deps.topK ?? 8;
  const authed = requireAuth(deps.verifier);

  app.post(CHAT_ROUTES.ask, authed, async (c) => {
    const learner = c.get("learnerId");
    const courseId = c.req.param("courseId");
    const course = await deps.store.getCourse(learner, courseId);
    if (!course) return c.json({ error: "not found" }, 404);

    type Body = { message?: unknown; history?: unknown };
    const body = await c.req.json<Body>().catch(() => ({}) as Body);
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (message.length === 0) return c.json({ error: "a question is required" }, 400);

    const history: ChatTurn[] = Array.isArray(body.history)
      ? (body.history as unknown[])
          .filter(
            (t): t is ChatTurn =>
              typeof t === "object" &&
              t !== null &&
              typeof (t as ChatTurn).text === "string" &&
              ((t as ChatTurn).role === "learner" || (t as ChatTurn).role === "tutor"),
          )
          .slice(-8)
      : [];

    const [owner, materials] = await Promise.all([
      deps.store.getLearner(learner),
      deps.store.materialsFor(learner, courseId),
    ]);
    const ready = materials.filter((m) => m.state === "ready" && m.ragFileId);
    if (!owner?.corpus || ready.length === 0) {
      return c.json({
        answer: { text: NOTHING_YET, citations: [], covered: false } satisfies Answer,
      });
    }

    const contexts = await deps.rag.retrieve({
      corpus: owner.corpus,
      ragFileIds: ready.map((m) => m.ragFileId as string),
      query: message,
      topK,
    });
    // A keyword pass over what came back. Vector retrieval is weakest on a course's own
    // vocabulary — a symbol, a module code, a lecturer's coinage — so a chunk that literally
    // contains the asked words is promoted. Cheap, and it only reorders what RAG returned.
    const ranked = rankByWords(contexts, message);

    const byUri = new Map(ready.map((m) => [m.gsUri, m]));
    const usable = ranked.filter((ctx) => byUri.has(ctx.sourceUri));
    if (usable.length === 0) {
      return c.json({
        answer: { text: NOTHING_YET, citations: [], covered: false } satisfies Answer,
      });
    }

    const sessions = await deps.store.sessionsFor(learner, courseId);
    const titles = new Map(sessions.map((s) => [s.id, s.title]));
    const labelled: LabelledChunk[] = usable.map((ctx, i) => {
      const material = byUri.get(ctx.sourceUri) as Material;
      return {
        label: i + 1,
        session: material.session,
        sessionTitle: titles.get(material.session) ?? "a session",
        filename: material.filename,
        text: ctx.text,
      };
    });

    const reply = await deps.ai.answer({ question: message, history, chunks: labelled });
    return c.json({ answer: attribute(reply, usable, byUri, titles) });
  });

  return app;
}

/** Exported so the hybrid half is testable on its own. */
export function rankByWords(contexts: RagContext[], query: string): RagContext[] {
  return [...contexts]
    .map((ctx) => ({ ctx, score: 0.75 * ctx.score + 0.25 * keywordScore(query, ctx.text) }))
    .sort((a, b) => b.score - a.score)
    .map(({ ctx }) => ctx);
}

/** Turns the model's labels into citations, dropping anything it was not actually given.
 *  Exported so the invariant is tested directly rather than only through a route. */
export function attribute(
  reply: { text: string; cited: number[]; covered: boolean },
  used: RagContext[],
  byUri: Map<string, Material>,
  titles: Map<string, string>,
): Answer {
  const citations: Citation[] = [];
  const seen = new Set<string>();
  for (const label of reply.cited) {
    // Labels are 1-based positions in exactly the list we sent. A hallucinated 99, a 0 or a
    // negative is discarded rather than surfaced.
    const ctx = used[label - 1];
    const material = ctx ? byUri.get(ctx.sourceUri) : undefined;
    if (!material) continue;
    const key = `${material.session}:${material.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({
      session: material.session,
      sessionTitle: titles.get(material.session) ?? "a session",
      material: material.id,
      filename: material.filename,
    });
  }

  // An answer that claims to be grounded but cites nothing we can verify is not shown.
  // Withholding is correct; a plausible unattributable answer is the failure 0006 exists to
  // prevent.
  if (reply.covered && citations.length === 0) {
    return {
      text: "There is something about this in your material, but not enough for an answer that can be traced back to a session. Try a more specific question.",
      citations: [],
      covered: false,
    };
  }

  return { text: reply.text, citations, covered: reply.covered };
}
