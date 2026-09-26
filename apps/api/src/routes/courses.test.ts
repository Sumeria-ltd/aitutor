import { ROUTES } from "@aitutor/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeVerifier } from "../auth.ts";
import { inMemoryStore, type Store } from "../firestore.ts";
import { mountCourses } from "./courses.ts";
import { createApp } from "./me.ts";

const ADA = { uid: "ada", email: "ada@example.test" };
const BOB = { uid: "bob", email: "bob@example.test" };

function harness() {
  const store: Store = inMemoryStore();
  const verifier = fakeVerifier({ "ada-token": ADA, "bob-token": BOB });
  let n = 0;
  const app = createApp({ store, verifier });
  mountCourses(app, { store, verifier, newId: () => `id-${++n}` });

  const call = (token: string | null, path: string, init: RequestInit = {}) =>
    app.request(path, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });

  const createCourse = async (token: string, name: string) => {
    const res = await call(token, ROUTES.courses, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    return { res, body: (await res.json()) as { course: { id: string; name: string } } };
  };

  return { store, call, createCourse };
}

describe("courses", () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => {
    h = harness();
  });

  it("creates a course and lists it back", async () => {
    const { res, body } = await h.createCourse("ada-token", "Thermodynamics II");
    expect(res.status).toBe(201);
    expect(body.course.name).toBe("Thermodynamics II");

    const list = await h.call("ada-token", ROUTES.courses);
    expect(list.status).toBe(200);
    const { courses } = (await list.json()) as { courses: { name: string }[] };
    expect(courses.map((c) => c.name)).toEqual(["Thermodynamics II"]);
  });

  it("trims the name and rejects an empty or oversized one", async () => {
    const { body } = await h.createCourse("ada-token", "  Spaced  ");
    expect(body.course.name).toBe("Spaced");

    for (const bad of ["", "   ", "x".repeat(121)]) {
      const res = await h.call("ada-token", ROUTES.courses, {
        method: "POST",
        body: JSON.stringify({ name: bad }),
      });
      expect(res.status).toBe(400);
    }
  });

  it("refuses every course route without a token", async () => {
    for (const [path, method] of [
      [ROUTES.courses, "GET"],
      [ROUTES.courses, "POST"],
      ["/api/courses/id-1", "GET"],
      ["/api/courses/id-1", "DELETE"],
    ] as const) {
      const res = await h.call(null, path, { method, body: method === "POST" ? "{}" : undefined });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });
});

// This is the demo's one non-negotiable (AIT-96): whatever else is rough, one learner's
// material must never be reachable by another. Reaching for someone else's course is
// answered 404 rather than 403 — a 403 would confirm the course exists.
describe("one learner cannot reach another learner's course", () => {
  it("does not list it, read it, delete it, or add a session to it", async () => {
    const h = harness();
    const { body } = await h.createCourse("ada-token", "Ada's course");
    const adasCourse = body.course.id;

    const bobsList = await h.call("bob-token", ROUTES.courses);
    expect(((await bobsList.json()) as { courses: unknown[] }).courses).toEqual([]);

    for (const [method, path] of [
      ["GET", `/api/courses/${adasCourse}`],
      ["DELETE", `/api/courses/${adasCourse}`],
      ["GET", `/api/courses/${adasCourse}/sessions`],
    ] as const) {
      const res = await h.call("bob-token", path, { method });
      expect(res.status, `bob ${method} ${path}`).toBe(404);
    }

    const addSession = await h.call("bob-token", `/api/courses/${adasCourse}/sessions`, {
      method: "POST",
      body: JSON.stringify({ title: "Week 1" }),
    });
    expect(addSession.status).toBe(404);

    // And Ada's course is untouched by any of it.
    const stillThere = await h.call("ada-token", `/api/courses/${adasCourse}`);
    expect(stillThere.status).toBe(200);
  });
});

describe("sessions", () => {
  it("adds sessions to a course and reads them back with it", async () => {
    const h = harness();
    const { body } = await h.createCourse("ada-token", "Thermodynamics II");
    const course = body.course.id;

    for (const title of ["Week 1 — intro", "Week 2 — entropy"]) {
      const res = await h.call("ada-token", `/api/courses/${course}/sessions`, {
        method: "POST",
        body: JSON.stringify({ title }),
      });
      expect(res.status).toBe(201);
    }

    const read = await h.call("ada-token", `/api/courses/${course}`);
    const { sessions } = (await read.json()) as { sessions: { title: string }[] };
    expect(sessions.map((s) => s.title)).toEqual(["Week 1 — intro", "Week 2 — entropy"]);
  });

  it("404s a session under a course that is not the learner's", async () => {
    const h = harness();
    const { body } = await h.createCourse("ada-token", "Ada's course");
    const res = await h.call("bob-token", `/api/courses/${body.course.id}/sessions/whatever`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  // PRD open question 11, decided 2026-09-26: one rule for a document, a session and a
  // course. Deleting the course takes its sessions with it — if they survived they would
  // be unreachable rather than gone, which is the failure 0010 exists to prevent.
  it("deleting a course removes its sessions too", async () => {
    const h = harness();
    const { body } = await h.createCourse("ada-token", "Doomed");
    const course = body.course.id;
    await h.call("ada-token", `/api/courses/${course}/sessions`, {
      method: "POST",
      body: JSON.stringify({ title: "Week 1" }),
    });

    expect(await h.store.sessionsFor("ada", course)).toHaveLength(1);
    const del = await h.call("ada-token", `/api/courses/${course}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    expect(await h.store.sessionsFor("ada", course)).toEqual([]);
    expect(await h.store.getCourse("ada", course)).toBeNull();
  });
});
