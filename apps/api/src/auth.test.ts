import { ROUTES } from "@aitutor/shared";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { type AuthedEnv, fakeVerifier, requireAuth } from "./auth.ts";

const verifier = fakeVerifier({ "tok-a": { uid: "uid-a", email: "a@example.com" } });

function guarded() {
  const app = new Hono<AuthedEnv>();
  app.get(ROUTES.me, requireAuth(verifier), (c) => c.json({ learnerId: c.get("learnerId") }));
  return app;
}

// A8 — the one place a token becomes a learner id.
describe("requireAuth", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await guarded().request(ROUTES.me);
    expect(res.status).toBe(401);
  });

  it("rejects a malformed header", async () => {
    const res = await guarded().request(ROUTES.me, { headers: { Authorization: "tok-a" } });
    expect(res.status).toBe(401);
  });

  it("rejects an unknown token", async () => {
    const res = await guarded().request(ROUTES.me, {
      headers: { Authorization: "Bearer nope" },
    });
    expect(res.status).toBe(401);
  });

  it("resolves a valid token to its own learner id and no other", async () => {
    const res = await guarded().request(ROUTES.me, {
      headers: { Authorization: "Bearer tok-a" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ learnerId: "uid-a" });
  });

  it("rejects a token whose refresh tokens have been revoked", async () => {
    const v = fakeVerifier({ "tok-x": { uid: "uid-x", email: "x@example.com" } });
    const app = new Hono<AuthedEnv>();
    app.get(ROUTES.me, requireAuth(v), (c) => c.json({ ok: true }));
    expect(
      (await app.request(ROUTES.me, { headers: { Authorization: "Bearer tok-x" } })).status,
    ).toBe(200);
    await v.revoke("uid-x");
    expect(
      (await app.request(ROUTES.me, { headers: { Authorization: "Bearer tok-x" } })).status,
    ).toBe(401);
  });
});

// A4 — the contract packages/shared declares, pinned on this side. Both surfaces use the
// symbol, so only pinning the literal here and in apps/web makes a change in shared fail both.
describe("the shared route contract", () => {
  it("mounts the paths packages/shared declares", () => {
    expect(ROUTES.session).toBe("/api/auth/session");
    expect(ROUTES.me).toBe("/api/me");
    expect(ROUTES.export).toBe("/api/me/export");
  });
});
