import type { Learner } from "@aitutor/shared";
import { ROUTES } from "@aitutor/shared";
import { Hono } from "hono";
import { type AuthedEnv, bearerToken, requireAuth, type TokenVerifier } from "../auth.ts";
import { emitter } from "../events.ts";
import type { Store } from "../firestore.ts";

export type Deps = {
  store: Store;
  verifier: TokenVerifier;
  now?: () => Date;
  /** Injected so the anonymisation token is deterministic under test. In production it
   *  is random and recorded nowhere. */
  anonymousToken?: () => string;
};

export function createApp(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  const token = deps.anonymousToken ?? (() => `anon-${crypto.randomUUID()}`);
  const emit = emitter(deps.store, now);
  const app = new Hono<AuthedEnv>();

  app.post(ROUTES.session, async (c) => {
    const raw = bearerToken(c);
    const body = await c.req
      .json<{ idToken?: string; secondsToComplete?: number }>()
      .catch(() => ({}) as { idToken?: string; secondsToComplete?: number });
    const idToken = body.idToken ?? raw;
    if (!idToken) return c.json({ error: "unauthenticated" }, 401);

    const identity = await deps.verifier.verify(idToken);
    if (!identity) return c.json({ error: "unauthenticated" }, 401);

    const existing = await deps.store.getLearner(identity.uid);
    if (existing) {
      await emit("account.signed_in", existing.id);
      return c.json({ learner: existing });
    }

    const learner: Learner = {
      id: identity.uid,
      email: identity.email,
      createdAt: now().toISOString(),
    };
    await deps.store.createLearner(learner);
    const seconds = typeof body.secondsToComplete === "number" ? body.secondsToComplete : 0;
    await emit("account.registered", learner.id, { secondsToComplete: seconds });
    return c.json({ learner }, 201);
  });

  const authed = requireAuth(deps.verifier);

  app.get(ROUTES.me, authed, async (c) => {
    const learner = await deps.store.getLearner(c.get("learnerId"));
    if (!learner) return c.json({ error: "unauthenticated" }, 401);
    return c.json({ learner });
  });

  app.get(ROUTES.export, authed, async (c) => {
    const learner = await deps.store.getLearner(c.get("learnerId"));
    if (!learner) return c.json({ error: "unauthenticated" }, 401);
    await emit("account.exported", learner.id);
    // The four collections are declared empty now so every later requirement extends
    // this payload rather than inventing an export of its own.
    return c.json({
      exportedAt: now().toISOString(),
      learner,
      courses: [],
      sessions: [],
      materials: [],
      summaries: [],
    });
  });

  app.delete(ROUTES.me, authed, async (c) => {
    const id = c.get("learnerId");
    const learner = await deps.store.getLearner(id);
    if (!learner) return c.json({ error: "unauthenticated" }, 401);
    // Emitted before anonymising, so the deletion itself is also unattributable after.
    await emit("account.deleted", id);
    await deps.store.deleteLearner(id);
    await deps.store.anonymiseEvents(id, token());
    await deps.verifier.revoke(id);
    return c.body(null, 204);
  });

  return app;
}
