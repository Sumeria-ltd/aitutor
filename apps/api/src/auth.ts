import type { Context, MiddlewareHandler } from "hono";

/** Identity is a port so the routes can be tested without a live project, and so the
 *  one place a token becomes a learner id stays visible (ADR 0006). */
export type Identity = { uid: string; email: string };

export type TokenVerifier = {
  verify(idToken: string): Promise<Identity | null>;
  revoke(uid: string): Promise<void>;
};

export type AuthedEnv = { Variables: { learnerId: string } };

export function fakeVerifier(tokens: Record<string, Identity>): TokenVerifier {
  const revoked = new Set<string>();
  return {
    async verify(idToken) {
      const identity = tokens[idToken];
      if (!identity || revoked.has(identity.uid)) return null;
      return identity;
    },
    async revoke(uid) {
      revoked.add(uid);
    },
  };
}

export async function firebaseVerifier(): Promise<TokenVerifier> {
  const { getAuth } = await import("firebase-admin/auth");
  const { initializeApp, getApps } = await import("firebase-admin/app");
  if (getApps().length === 0) initializeApp();
  const auth = getAuth();
  return {
    async verify(idToken) {
      try {
        // checkRevoked: a deleted learner's existing sessions must stop working.
        const decoded = await auth.verifyIdToken(idToken, true);
        if (!decoded.email) return null;
        return { uid: decoded.uid, email: decoded.email };
      } catch {
        return null;
      }
    },
    async revoke(uid) {
      await auth.revokeRefreshTokens(uid);
    },
  };
}

export function bearerToken(c: Context): string | null {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/** Every route except session creation goes through here, so no handler decides for
 *  itself whose records it may read. */
export function requireAuth(verifier: TokenVerifier): MiddlewareHandler<AuthedEnv> {
  return async (c, next) => {
    const token = bearerToken(c);
    if (!token) return c.json({ error: "unauthenticated" }, 401);
    const identity = await verifier.verify(token);
    if (!identity) return c.json({ error: "unauthenticated" }, 401);
    c.set("learnerId", identity.uid);
    await next();
  };
}
