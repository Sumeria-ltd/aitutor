import type { Course, CourseSession } from "@aitutor/shared";
import { checkName, checkSchedule, ROUTES } from "@aitutor/shared";
import type { Hono } from "hono";
import { type AuthedEnv, requireAuth, type TokenVerifier } from "../auth.ts";
import { type Files, objectKey } from "../files.ts";
import type { Removed, Store } from "../firestore.ts";
import type { Rag } from "../rag.ts";

/** Courses and their sessions — phase D (PRD §10), the customer capability demo.
 *
 *  The learner id comes from `c.get("learnerId")`, set by requireAuth from a verified
 *  token, and never from the path or body. A request for someone else's course is
 *  therefore indistinguishable from a request for a course that does not exist, which
 *  is the behaviour we want: 404, not 403, because 403 confirms it exists. */

export type CourseDeps = {
  store: Store;
  verifier: TokenVerifier;
  /** Deleting a session or a course must free the bytes too, not only make them
   *  unreachable. Optional so the route still works without them, in which case the
   *  cleanup is skipped and the records are still gone. */
  rag?: Rag;
  files?: Files;
  now?: () => Date;
  newId?: () => string;
};

/** Removes what a container deletion left behind in the index and the bucket.
 *
 *  The Firestore records have already gone by the time this runs, so retrieval cannot
 *  reach any of it — requirement 0010's acceptance line is satisfied before this starts,
 *  and that is why every failure here is swallowed. What this adds is the other half of
 *  the promise: a learner told "deleted" should not still have bytes in our storage.
 *  Best effort, because a ragFile we failed to remove is cost and clutter rather than a
 *  leak, and because failing the request would tell the learner nothing was deleted when
 *  in fact it was. */
async function sweep(deps: CourseDeps, learner: string, courseId: string, taken: Removed[]) {
  if (taken.length === 0) return;
  const owner = deps.rag ? await deps.store.getLearner(learner).catch(() => null) : null;
  for (const m of taken) {
    if (deps.rag && owner?.corpus && m.ragFileId) {
      await deps.rag.deleteFile(owner.corpus, m.ragFileId).catch(() => {});
    }
    await deps.files?.remove(objectKey(learner, courseId, m.id, m.filename)).catch(() => {});
  }
}

export function mountCourses(app: Hono<AuthedEnv>, deps: CourseDeps) {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const authed = requireAuth(deps.verifier);

  app.post(ROUTES.courses, authed, async (c) => {
    const body = await c.req.json<{ name?: unknown }>().catch(() => ({}) as { name?: unknown });
    const name = checkName(body.name);
    if (!name.ok) return c.json({ error: name.reason }, 400);

    const course: Course = {
      id: newId(),
      learner: c.get("learnerId"),
      name: name.value,
      createdAt: now().toISOString(),
    };
    await deps.store.createCourse(course);
    return c.json({ course }, 201);
  });

  app.get(ROUTES.courses, authed, async (c) => {
    const courses = await deps.store.coursesFor(c.get("learnerId"));
    return c.json({ courses });
  });

  app.get(ROUTES.course, authed, async (c) => {
    const course = await deps.store.getCourse(c.get("learnerId"), c.req.param("courseId"));
    if (!course) return c.json({ error: "not found" }, 404);
    const sessions = await deps.store.sessionsFor(course.learner, course.id);
    return c.json({ course, sessions });
  });

  app.delete(ROUTES.course, authed, async (c) => {
    const learner = c.get("learnerId");
    const courseId = c.req.param("courseId");
    // Read first: deleting by id alone would silently succeed against a course this
    // learner does not own, and report success for something that never happened.
    const course = await deps.store.getCourse(learner, courseId);
    if (!course) return c.json({ error: "not found" }, 404);
    const taken = await deps.store.deleteCourse(learner, courseId);
    await sweep(deps, learner, courseId, taken);
    return c.body(null, 204);
  });

  app.post(ROUTES.courseSessions, authed, async (c) => {
    const learner = c.get("learnerId");
    const courseId = c.req.param("courseId");
    const course = await deps.store.getCourse(learner, courseId);
    if (!course) return c.json({ error: "not found" }, 404);

    type Body = { title?: unknown; startsAt?: unknown; minutes?: unknown };
    const body = await c.req.json<Body>().catch(() => ({}) as Body);
    const title = checkName(body.title);
    if (!title.ok) return c.json({ error: title.reason }, 400);
    const when = checkSchedule(body);
    if (!when.ok) return c.json({ error: when.reason }, 400);

    // Appended, never inserted. "Add to the bottom, then drag it where it belongs" is the
    // interaction intent 0011 describes, and the position is ours to assign.
    const existing = await deps.store.sessionsFor(learner, courseId);
    const session: CourseSession = {
      id: newId(),
      learner,
      course: courseId,
      title: title.value,
      ...when.value,
      position: existing.length,
      createdAt: now().toISOString(),
    };
    await deps.store.createSession(session);
    return c.json({ session }, 201);
  });

  app.patch(ROUTES.courseSession, authed, async (c) => {
    const learner = c.get("learnerId");
    const courseId = c.req.param("courseId");
    const sessionId = c.req.param("sessionId");
    const session = await deps.store.getSession(learner, courseId, sessionId);
    if (!session) return c.json({ error: "not found" }, 404);

    type Body = { title?: unknown; startsAt?: unknown; minutes?: unknown };
    const body = await c.req.json<Body>().catch(() => ({}) as Body);
    const patch: Partial<CourseSession> = {};

    if (body.title !== undefined) {
      const title = checkName(body.title);
      if (!title.ok) return c.json({ error: title.reason }, 400);
      patch.title = title.value;
    }
    const when = checkSchedule(body);
    if (!when.ok) return c.json({ error: when.reason }, 400);
    Object.assign(patch, when.value);

    // A date arriving, changing or being corrected never moves the row. The learner's
    // order is the truth — PRD open question 17.
    await deps.store.updateSession(learner, courseId, sessionId, patch);
    const updated = await deps.store.getSession(learner, courseId, sessionId);
    return c.json({ session: updated });
  });

  app.put(ROUTES.courseSessionOrder, authed, async (c) => {
    const learner = c.get("learnerId");
    const courseId = c.req.param("courseId");
    const course = await deps.store.getCourse(learner, courseId);
    if (!course) return c.json({ error: "not found" }, 404);

    const body = await c.req.json<{ ids?: unknown }>().catch(() => ({}) as { ids?: unknown });
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((x): x is string => typeof x === "string")
      : null;
    if (!ids) return c.json({ error: "an order is required" }, 400);

    // Rejected whole rather than applied partly: a reorder that half-lands leaves the
    // learner with an arrangement they never chose, which is worse than a refusal.
    const held = await deps.store.sessionsFor(learner, courseId);
    const mine = new Set(held.map((s) => s.id));
    const sameSize = ids.length === held.length;
    const allMine = ids.every((id) => mine.has(id));
    const noDuplicates = new Set(ids).size === ids.length;
    if (!sameSize || !allMine || !noDuplicates) {
      return c.json({ error: "that order does not match this course's sessions" }, 400);
    }

    await deps.store.reorderSessions(learner, courseId, ids);
    return c.json({ sessions: await deps.store.sessionsFor(learner, courseId) });
  });

  app.get(ROUTES.courseSessions, authed, async (c) => {
    const learner = c.get("learnerId");
    const courseId = c.req.param("courseId");
    const course = await deps.store.getCourse(learner, courseId);
    if (!course) return c.json({ error: "not found" }, 404);
    const sessions = await deps.store.sessionsFor(learner, courseId);
    return c.json({ sessions });
  });

  app.delete(ROUTES.courseSession, authed, async (c) => {
    const learner = c.get("learnerId");
    const courseId = c.req.param("courseId");
    const sessionId = c.req.param("sessionId");
    const session = await deps.store.getSession(learner, courseId, sessionId);
    if (!session) return c.json({ error: "not found" }, 404);
    const taken = await deps.store.deleteSession(learner, courseId, sessionId);
    await sweep(deps, learner, courseId, taken);
    return c.body(null, 204);
  });

  return app;
}
