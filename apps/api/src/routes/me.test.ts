import { ROUTES } from "@aitutor/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeVerifier } from "../auth.js";
import { inMemoryStore, type Store } from "../firestore.js";
import { createApp } from "./me.js";

const IDENTITIES = {
  "tok-a": { uid: "uid-a", email: "a@example.com" },
  "tok-b": { uid: "uid-b", email: "b@example.com" },
};

let store: Store;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  store = inMemoryStore();
  app = createApp({
    store,
    verifier: fakeVerifier(IDENTITIES),
    now: () => new Date("2026-09-08T10:00:00.000Z"),
    anonymousToken: () => "anon-fixed",
  });
});

const auth = (t: string) => ({ headers: { Authorization: `Bearer ${t}` } });
const post = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// A7 — first call registers, second signs in, and the events say which.
describe("POST session", () => {
  it("creates the learner and emits account.registered on first sight", async () => {
    const res = await app.request(
      ROUTES.session,
      post({ idToken: "tok-a", secondsToComplete: 41 }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      learner: { id: "uid-a", email: "a@example.com", createdAt: "2026-09-08T10:00:00.000Z" },
    });
    const events = await store.eventsFor("uid-a");
    expect(events.map((e) => e.name)).toEqual(["account.registered"]);
    expect(events[0]?.attributes).toEqual({ secondsToComplete: 41 });
    expect(events[0]?.requirement).toBe("0001");
  });

  it("emits account.signed_in and creates nothing on the second call", async () => {
    await app.request(ROUTES.session, post({ idToken: "tok-a" }));
    const res = await app.request(ROUTES.session, post({ idToken: "tok-a" }));
    expect(res.status).toBe(200);
    const names = (await store.eventsFor("uid-a")).map((e) => e.name);
    expect(names).toEqual(["account.registered", "account.signed_in"]);
  });

  it("rejects an unknown token", async () => {
    expect((await app.request(ROUTES.session, post({ idToken: "nope" }))).status).toBe(401);
  });
});

// A8 — no route returns a record belonging to someone else.
describe("cross-learner isolation", () => {
  it("returns the caller's own record, never another learner's", async () => {
    await app.request(ROUTES.session, post({ idToken: "tok-a" }));
    await app.request(ROUTES.session, post({ idToken: "tok-b" }));

    const res = await app.request(ROUTES.me, auth("tok-b"));
    const body = (await res.json()) as { learner: { id: string; email: string } };
    expect(body.learner.id).toBe("uid-b");
    expect(body.learner.email).toBe("b@example.com");
    expect(JSON.stringify(body)).not.toContain("uid-a");
    expect(JSON.stringify(body)).not.toContain("a@example.com");
  });

  it("refuses an unauthenticated read", async () => {
    expect((await app.request(ROUTES.me)).status).toBe(401);
  });
});

// A9 — export carries the learner and the four collections, declared empty.
describe("GET export", () => {
  it("returns the learner and the four declared collections", async () => {
    await app.request(ROUTES.session, post({ idToken: "tok-a" }));
    const res = await app.request(ROUTES.export, auth("tok-a"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      exportedAt: "2026-09-08T10:00:00.000Z",
      learner: { id: "uid-a", email: "a@example.com", createdAt: "2026-09-08T10:00:00.000Z" },
      courses: [],
      sessions: [],
      materials: [],
      summaries: [],
    });
    expect((await store.eventsFor("uid-a")).map((e) => e.name)).toContain("account.exported");
  });
});

// A10 — after deletion nothing remains reachable, and no event is attributable.
describe("DELETE me", () => {
  it("removes the record, invalidates the token, and anonymises every event", async () => {
    await app.request(ROUTES.session, post({ idToken: "tok-a", secondsToComplete: 41 }));
    expect((await store.eventsFor("uid-a")).length).toBe(1);

    const res = await app.request(ROUTES.me, { method: "DELETE", ...auth("tok-a") });
    expect(res.status).toBe(204);

    expect(await store.getLearner("uid-a")).toBeNull();
    expect((await app.request(ROUTES.me, auth("tok-a"))).status).toBe(401);

    // No event still carries the learner id.
    expect(await store.eventsFor("uid-a")).toEqual([]);
    const all = await store.allEvents();
    expect(all.length).toBe(2);
    expect(all.every((e) => e.learner === "anon-fixed")).toBe(true);
    // The account.deleted event survives, so the cohort count is not lost.
    expect(all.map((e) => e.name)).toEqual(["account.registered", "account.deleted"]);
  });

  it("refuses an unauthenticated delete", async () => {
    expect((await app.request(ROUTES.me, { method: "DELETE" })).status).toBe(401);
  });
});
