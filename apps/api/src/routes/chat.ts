import type { Answer, ChatTurn, Citation, Material } from "@aitutor/shared";
import { keywordScore } from "@aitutor/shared";
import type { Hono } from "hono";
import { type AuthedEnv, requireAuth, type TokenVerifier } from "../auth.ts";
import type { Store } from "../firestore.ts";
import type { Rag, RagContext } from "../rag.ts";
import { readableSet, retrieveFor } from "../readable.ts";
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

/** Distinct from NOTHING_YET on purpose. "Your material doesn't cover this" and "I have
 *  not finished reading your material" are different facts, and telling the learner the
 *  first when the second is true is the quiet failure requirement 0010 exists to stop. */
const STILL_READING =
  "Some of this course's material is still being read, so there is nothing to answer from yet. Try again in a moment.";

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

    // The one place that answers "what may this request read?" — spec 0010. Nothing else
    // in this handler decides it, and nothing else calls the retriever.
    const set = await readableSet(deps.store, learner, courseId);
    const stillReading = set.pending.map((m) => ({ filename: m.filename }));

    if (set.allow.length === 0) {
      return c.json({
        answer: {
          text: stillReading.length > 0 ? STILL_READING : NOTHING_YET,
          citations: [],
          covered: false,
          ...(stillReading.length > 0 ? { pending: stillReading } : {}),
        } satisfies Answer,
      });
    }

    const contexts = await retrieveFor(deps.rag, set, message, topK);
    // A keyword pass over what came back. Vector retrieval is weakest on a course's own
    // vocabulary — a symbol, a module code, a lecturer's coinage — so a chunk that literally
    // contains the asked words is promoted. Cheap, and it only reorders what RAG returned.
    const ranked = rankByWords(contexts, message);

    // retrieveFor has already asserted every context belongs to this learner, so this map
    // is a lookup rather than a filter. A foreign context never reaches here — it throws.
    const byUri = new Map(set.allow.map((a) => [a.material.gsUri, a.material]));
    const usable = ranked;
    if (usable.length === 0) {
      return c.json({
        answer: {
          text: stillReading.length > 0 ? STILL_READING : NOTHING_YET,
          citations: [],
          covered: false,
          ...(stillReading.length > 0 ? { pending: stillReading } : {}),
        } satisfies Answer,
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
    const answer = attribute(reply, usable, byUri, titles);
    // Named, not merely counted. An answer built from a subset of what the learner has
    // added is thinner than it looks, and saying nothing is the failure PRD §8 describes.
    return c.json({
      answer: stillReading.length > 0 ? { ...answer, pending: stillReading } : answer,
    });
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
