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

describe("the schedule — requirement 0011", () => {
  const add = (
    h: ReturnType<typeof harness>,
    courseId: string,
    title: string,
    extra: Record<string, unknown> = {},
  ) =>
    h.call("ada-token", `/api/courses/${courseId}/sessions`, {
      method: "POST",
      body: JSON.stringify({ title, ...extra }),
    });

  const list = async (h: ReturnType<typeof harness>, courseId: string) =>
    (
      (await (await h.call("ada-token", `/api/courses/${courseId}/sessions`)).json()) as {
        sessions: { id: string; title: string; startsAt?: string; minutes?: number }[];
      }
    ).sessions;

  it("shows a date, a start time and a length on every session that has them", async () => {
    const h = harness();
    const courseId = (await h.createCourse("ada-token", "Thermo")).body.course.id;
    for (const n of [1, 2, 3, 4]) {
      const res = await add(h, courseId, `Week ${n}`, {
        startsAt: `2026-10-0${n}T09:00:00.000Z`,
        minutes: 90,
      });
      expect(res.status).toBe(201);
    }

    const sessions = await list(h, courseId);
    expect(sessions).toHaveLength(4);
    // All three, without opening anything.
    expect(sessions.every((s) => s.startsAt && s.minutes === 90)).toBe(true);
  });

  it("appends a new session to the end", async () => {
    const h = harness();
    const courseId = (await h.createCourse("ada-token", "Thermo")).body.course.id;
    for (const n of [1, 2, 3]) await add(h, courseId, `Week ${n}`);

    await add(h, courseId, "Week 4");

    expect((await list(h, courseId)).map((s) => s.title)).toEqual([
      "Week 1",
      "Week 2",
      "Week 3",
      "Week 4",
    ]);
  });

  it("keeps the order the learner left, and moves nothing else", async () => {
    const h = harness();
    const courseId = (await h.createCourse("ada-token", "Thermo")).body.course.id;
    for (const n of [1, 2, 3, 4]) await add(h, courseId, `Week ${n}`);
    const before = await list(h, courseId);

    // Drag the last to second.
    const moved = [before[0], before[3], before[1], before[2]].map((s) => s?.id);
    const res = await h.call("ada-token", `/api/courses/${courseId}/session-order`, {
      method: "PUT",
      body: JSON.stringify({ ids: moved }),
    });
    expect(res.status).toBe(200);

    expect((await list(h, courseId)).map((s) => s.title)).toEqual([
      "Week 1",
      "Week 4",
      "Week 2",
      "Week 3",
    ]);
  });

  it("refuses an order that is not exactly this course's sessions", async () => {
    const h = harness();
    const courseId = (await h.createCourse("ada-token", "Thermo")).body.course.id;
    for (const n of [1, 2]) await add(h, courseId, `Week ${n}`);
    const ids = (await list(h, courseId)).map((s) => s.id);

    for (const bad of [[ids[0]], [...ids, "not-mine"], [ids[0], ids[0]]]) {
      const res = await h.call("ada-token", `/api/courses/${courseId}/session-order`, {
        method: "PUT",
        body: JSON.stringify({ ids: bad }),
      });
      // Rejected whole. A half-applied reorder leaves an arrangement nobody chose.
      expect(res.status).toBe(400);
    }
    expect((await list(h, courseId)).map((s) => s.title)).toEqual(["Week 1", "Week 2"]);
  });

  it("never reorders on the learner's behalf when a date says it should", async () => {
    const h = harness();
    const courseId = (await h.createCourse("ada-token", "Thermo")).body.course.id;
    await add(h, courseId, "Week 1", { startsAt: "2026-10-01T09:00:00.000Z" });
    await add(h, courseId, "Week 2", { startsAt: "2026-10-08T09:00:00.000Z" });
    const [, second] = await list(h, courseId);

    // Give the second session a date earlier than the first and leave it where it is.
    const res = await h.call("ada-token", `/api/courses/${courseId}/sessions/${second?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ startsAt: "2026-09-01T09:00:00.000Z" }),
    });
    expect(res.status).toBe(200);

    // PRD open question 17: the learner's order wins, and dates never sort.
    expect((await list(h, courseId)).map((s) => s.title)).toEqual(["Week 1", "Week 2"]);
  });

  it("accepts a session with no date and supplies none", async () => {
    const h = harness();
    const courseId = (await h.createCourse("ada-token", "Thermo")).body.course.id;

    const res = await add(h, courseId, "Sometime in week 5");
    expect(res.status).toBe(201);

    const [only] = await list(h, courseId);
    expect(only?.startsAt).toBeUndefined();
    expect(only?.minutes).toBeUndefined();
  });

  it("refuses a length that is not a sane number of minutes", async () => {
    const h = harness();
    const courseId = (await h.createCourse("ada-token", "Thermo")).body.course.id;
    for (const minutes of [0, -30, 1000, 45.5]) {
      const res = await add(h, courseId, "Week 1", { minutes });
      expect(res.status, `minutes=${minutes} was accepted`).toBe(400);
    }
  });

  it("refuses a date that is not a date", async () => {
    const h = harness();
    const courseId = (await h.createCourse("ada-token", "Thermo")).body.course.id;
    const res = await add(h, courseId, "Week 1", { startsAt: "next tuesday-ish" });
    expect(res.status).toBe(400);
  });
});
