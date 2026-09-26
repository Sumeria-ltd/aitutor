import type { Answer, ChatTurn, Citation, Retrieved } from "@aitutor/shared";
import type { Hono } from "hono";
import { type AuthedEnv, requireAuth, type TokenVerifier } from "../auth.ts";
import type { Store } from "../firestore.ts";
import type { Ai, LabelledChunk } from "../vertex.ts";

/** The chat — AIT-94. Multi-turn, answers only from the asking learner's own material, and
 *  every answer names the session it drew from.
 *
 *  The citation invariant lives here, in our code, because the model will not do it for us
 *  (CLAUDE.md). The model is shown chunks labelled "Document 1..n" and cites by label; it
 *  never sees a session id, so it cannot invent one. A label outside the set we sent is
 *  dropped, and an answer claiming to be covered with no surviving citation is downgraded
 *  to "your material doesn't cover this" rather than shown. That is the point: an answer we
 *  cannot attribute is not shown at all. */

export type ChatDeps = {
  store: Store;
  verifier: TokenVerifier;
  ai: Ai;
  /** How many chunks go into one answer. Bounded before the request starts, per the
   *  constraint in PRD §7 on multi-step retrieval. */
  topK?: number;
};

export const CHAT_ROUTES = { ask: "/api/courses/:courseId/chat" } as const;

export function mountChat(app: Hono<AuthedEnv>, deps: ChatDeps) {
  const topK = deps.topK ?? 8;
  const authed = requireAuth(deps.verifier);

  app.post(CHAT_ROUTES.ask, authed, async (c) => {
    const learner = c.get("learnerId");
    const courseId = c.req.param("courseId");
    const course = await deps.store.getCourse(learner, courseId);
    if (!course) return c.json({ error: "not found" }, 404);

    type Body = { message?: unknown; history?: unknown; sessions?: unknown };
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
    const sessions = Array.isArray(body.sessions)
      ? (body.sessions as unknown[]).filter((s): s is string => typeof s === "string")
      : undefined;

    const [queryEmbedding] = await deps.ai.embed([message], "query");
    const retrieved = await deps.store.searchChunks({
      learner,
      courseId,
      sessions,
      queryEmbedding: queryEmbedding ?? [],
      queryText: message,
      limit: topK,
    });

    if (retrieved.length === 0) {
      return c.json({
        answer: {
          text: "Nothing in this course's material covers that yet. If you have a handout or slides about it, add them to the session they belong to and ask again.",
          citations: [],
          covered: false,
        } satisfies Answer,
      });
    }

    const names = await lookups(deps.store, learner, courseId);
    const labelled: LabelledChunk[] = retrieved.map((k, i) => ({
      label: i + 1,
      session: k.session,
      sessionTitle: names.sessions.get(k.session) ?? "a session",
      filename: names.materials.get(k.material) ?? "",
      text: k.text,
    }));

    const reply = await deps.ai.answer({ question: message, history, chunks: labelled });
    return c.json({ answer: attribute(reply, retrieved, names) });
  });

  return app;
}

export type Lookups = { sessions: Map<string, string>; materials: Map<string, string> };

/** Session titles and filenames, so a citation reads "Week 3 — entropy · lecture4.pdf"
 *  rather than a pair of ids. This is the part of the answer the demo is actually for. */
async function lookups(store: Store, learner: string, courseId: string): Promise<Lookups> {
  const [sessions, materials] = await Promise.all([
    store.sessionsFor(learner, courseId),
    store.materialsFor(learner, courseId),
  ]);
  return {
    sessions: new Map(sessions.map((s) => [s.id, s.title])),
    materials: new Map(materials.map((m) => [m.id, m.filename])),
  };
}

/** Turns the model's labels into citations, dropping anything it did not actually receive.
 *  Exported so the invariant is tested directly rather than only through a route. */
export function attribute(
  reply: { text: string; cited: number[]; covered: boolean },
  retrieved: Retrieved[],
  names: Lookups,
): Answer {
  const citations: Citation[] = [];
  const seen = new Set<string>();
  for (const label of reply.cited) {
    // Labels are 1-based positions in exactly the list we sent. Anything else — a
    // hallucinated 99, a 0, a negative — is discarded rather than surfaced.
    const chunk = retrieved[label - 1];
    if (!chunk) continue;
    const key = `${chunk.session}:${chunk.material}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({
      session: chunk.session,
      sessionTitle: names.sessions.get(chunk.session) ?? "a session",
      material: chunk.material,
      filename: names.materials.get(chunk.material) ?? "",
    });
  }

  // An answer that claims to be grounded but cites nothing we can verify is not shown.
  // Withholding is the correct outcome; a plausible unattributable answer is the failure
  // requirement 0006 exists to prevent.
  if (reply.covered && citations.length === 0) {
    return {
      text: "There is something about this in your material, but not enough for an answer that can be traced back to a session. Try a more specific question.",
      citations: [],
      covered: false,
    };
  }

  return { text: reply.text, citations, covered: reply.covered };
}
