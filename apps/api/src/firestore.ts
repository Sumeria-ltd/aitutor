import type { AitutorEvent, Course, CourseSession, Learner, Material } from "@aitutor/shared";

/** Storage is a port. Every read is scoped by the owning learner id, so there is no
 *  query shape here that can return another learner's record (ADR 0006).
 *
 *  Note the shape of the course and session methods: `learner` is the first argument of
 *  every one, including the reads that already have a course id. That is deliberate —
 *  it means a handler cannot fetch a record by id alone and then forget to check who
 *  owns it, because there is no method that would let it. */
export type Store = {
  getLearner(id: string): Promise<Learner | null>;
  createLearner(learner: Learner): Promise<Learner>;
  deleteLearner(id: string): Promise<void>;
  /** Records the learner's RAG corpus so it is created once and only once. */
  setLearnerCorpus(id: string, corpus: string): Promise<void>;
  createCourse(course: Course): Promise<Course>;
  coursesFor(learner: string): Promise<Course[]>;
  getCourse(learner: string, courseId: string): Promise<Course | null>;
  deleteCourse(learner: string, courseId: string): Promise<void>;
  createSession(session: CourseSession): Promise<CourseSession>;
  sessionsFor(learner: string, courseId: string): Promise<CourseSession[]>;
  getSession(learner: string, courseId: string, sessionId: string): Promise<CourseSession | null>;
  deleteSession(learner: string, courseId: string, sessionId: string): Promise<void>;
  createMaterial(material: Material): Promise<Material>;
  updateMaterial(
    learner: string,
    courseId: string,
    materialId: string,
    patch: Partial<Material>,
  ): Promise<void>;
  materialsFor(learner: string, courseId: string): Promise<Material[]>;
  getMaterial(learner: string, courseId: string, materialId: string): Promise<Material | null>;
  /** Removes the material and every chunk derived from it, in that order. After this
   *  returns, no search can reach it — that is requirement 0010's deletion criterion and
   *  it allows zero retries, so there is no eventual-consistency window to wait out. */
  deleteMaterial(learner: string, courseId: string, materialId: string): Promise<void>;
  appendEvent(event: AitutorEvent): Promise<void>;
  /** Replaces the learner key on every event they produced with a token recorded
   *  nowhere, so the events stay countable and stop being attributable. */
  anonymiseEvents(learner: string, token: string): Promise<void>;
  eventsFor(learner: string): Promise<AitutorEvent[]>;
  allEvents(): Promise<AitutorEvent[]>;
};

export function inMemoryStore(): Store {
  const learners = new Map<string, Learner>();
  let events: AitutorEvent[] = [];
  let courses: Course[] = [];
  let sessions: CourseSession[] = [];
  let materials: Material[] = [];
  return {
    async getLearner(id) {
      return learners.get(id) ?? null;
    },
    async createLearner(learner) {
      learners.set(learner.id, learner);
      return learner;
    },
    async deleteLearner(id) {
      learners.delete(id);
    },
    async setLearnerCorpus(id, corpus) {
      const existing = learners.get(id);
      if (existing) learners.set(id, { ...existing, corpus });
    },
    async createCourse(course) {
      courses.push(course);
      return course;
    },
    async coursesFor(learner) {
      return courses.filter((c) => c.learner === learner);
    },
    async getCourse(learner, courseId) {
      return courses.find((c) => c.learner === learner && c.id === courseId) ?? null;
    },
    async deleteCourse(learner, courseId) {
      courses = courses.filter((c) => !(c.learner === learner && c.id === courseId));
      // A course's sessions, material and chunks all go with it: PRD open question 11 —
      // one rule for a document, a session and a course.
      sessions = sessions.filter((s) => !(s.learner === learner && s.course === courseId));
      materials = materials.filter((m) => !(m.learner === learner && m.course === courseId));
    },
    async createSession(session) {
      sessions.push(session);
      return session;
    },
    async sessionsFor(learner, courseId) {
      return sessions.filter((s) => s.learner === learner && s.course === courseId);
    },
    async getSession(learner, courseId, sessionId) {
      return (
        sessions.find(
          (s) => s.learner === learner && s.course === courseId && s.id === sessionId,
        ) ?? null
      );
    },
    async deleteSession(learner, courseId, sessionId) {
      sessions = sessions.filter(
        (s) => !(s.learner === learner && s.course === courseId && s.id === sessionId),
      );
      materials = materials.filter(
        (m) => !(m.learner === learner && m.course === courseId && m.session === sessionId),
      );
    },
    async createMaterial(material) {
      materials.push(material);
      return material;
    },
    async updateMaterial(learner, courseId, materialId, patch) {
      materials = materials.map((m) =>
        m.learner === learner && m.course === courseId && m.id === materialId
          ? { ...m, ...patch }
          : m,
      );
    },
    async materialsFor(learner, courseId) {
      return materials.filter((m) => m.learner === learner && m.course === courseId);
    },
    async getMaterial(learner, courseId, materialId) {
      return (
        materials.find(
          (m) => m.learner === learner && m.course === courseId && m.id === materialId,
        ) ?? null
      );
    },
    async deleteMaterial(learner, courseId, materialId) {
      materials = materials.filter(
        (m) => !(m.learner === learner && m.course === courseId && m.id === materialId),
      );
    },
    async appendEvent(event) {
      events.push(event);
    },
    async anonymiseEvents(learner, token) {
      events = events.map((e) => (e.learner === learner ? { ...e, learner: token } : e));
    },
    async eventsFor(learner) {
      return events.filter((e) => e.learner === learner);
    },
    async allEvents() {
      return [...events];
    },
  };
}

export type FirestoreLike = {
  collection(path: string): {
    doc(id: string): {
      get(): Promise<{ exists: boolean; data(): unknown }>;
      set(value: unknown): Promise<unknown>;
      update(value: unknown): Promise<unknown>;
      delete(): Promise<unknown>;
    };
    add(value: unknown): Promise<unknown>;
    where(
      field: string,
      op: string,
      value: unknown,
    ): {
      get(): Promise<{
        docs: { ref: { update(v: unknown): Promise<unknown> }; data(): unknown }[];
      }>;
    };
    get(): Promise<{ docs: { id: string; data(): unknown }[] }>;
  };
};

/** Courses and sessions are stored *under* the learner — `learners/<id>/courses/...` —
 *  so the privacy boundary is the storage path itself rather than a field that a query
 *  has to remember to filter on. There is no path to a course that does not name its
 *  owner (ADR 0006). */
const coursesPath = (learner: string) => `learners/${learner}/courses`;
const sessionsPath = (learner: string, courseId: string) =>
  `learners/${learner}/courses/${courseId}/sessions`;
const materialsPath = (learner: string, courseId: string) =>
  `learners/${learner}/courses/${courseId}/materials`;

export function firestoreStore(db: FirestoreLike): Store {
  return {
    async getLearner(id) {
      const snap = await db.collection("learners").doc(id).get();
      if (!snap.exists) return null;
      return { id, ...(snap.data() as Omit<Learner, "id">) };
    },
    async createLearner(learner) {
      const { id, ...rest } = learner;
      await db.collection("learners").doc(id).set(rest);
      return learner;
    },
    async deleteLearner(id) {
      await db.collection("learners").doc(id).delete();
    },
    async setLearnerCorpus(id, corpus) {
      await db.collection("learners").doc(id).update({ corpus });
    },
    async createCourse(course) {
      const { id, learner, ...rest } = course;
      await db.collection(coursesPath(learner)).doc(id).set(rest);
      return course;
    },
    async coursesFor(learner) {
      const found = await db.collection(coursesPath(learner)).get();
      return found.docs.map((d) => ({
        id: d.id,
        learner,
        ...(d.data() as Omit<Course, "id" | "learner">),
      }));
    },
    async getCourse(learner, courseId) {
      const snap = await db.collection(coursesPath(learner)).doc(courseId).get();
      if (!snap.exists) return null;
      return { id: courseId, learner, ...(snap.data() as Omit<Course, "id" | "learner">) };
    },
    async deleteCourse(learner, courseId) {
      // Deleting a document in Firestore does not delete its subcollections, so the
      // sessions, material and chunks have to go explicitly or they become unreachable
      // rather than gone — which is exactly the failure requirement 0010 is about.
      for (const path of [materialsPath(learner, courseId), sessionsPath(learner, courseId)]) {
        const found = await db.collection(path).get();
        await Promise.all(found.docs.map((d) => db.collection(path).doc(d.id).delete()));
      }
      await db.collection(coursesPath(learner)).doc(courseId).delete();
    },
    async createSession(session) {
      const { id, learner, course, ...rest } = session;
      await db.collection(sessionsPath(learner, course)).doc(id).set(rest);
      return session;
    },
    async sessionsFor(learner, courseId) {
      const found = await db.collection(sessionsPath(learner, courseId)).get();
      return found.docs.map((d) => ({
        id: d.id,
        learner,
        course: courseId,
        ...(d.data() as Omit<CourseSession, "id" | "learner" | "course">),
      }));
    },
    async getSession(learner, courseId, sessionId) {
      const snap = await db.collection(sessionsPath(learner, courseId)).doc(sessionId).get();
      if (!snap.exists) return null;
      return {
        id: sessionId,
        learner,
        course: courseId,
        ...(snap.data() as Omit<CourseSession, "id" | "learner" | "course">),
      };
    },
    async deleteSession(learner, courseId, sessionId) {
      // Same reasoning as deleteCourse: the material and chunks under this session must go,
      // or an answer could still quote a session the learner deleted.
      for (const path of [materialsPath(learner, courseId)]) {
        const found = await db.collection(path).get();
        const doomed = found.docs.filter(
          (d) => (d.data() as { session?: string }).session === sessionId,
        );
        await Promise.all(doomed.map((d) => db.collection(path).doc(d.id).delete()));
      }
      await db.collection(sessionsPath(learner, courseId)).doc(sessionId).delete();
    },
    async createMaterial(material) {
      const { id, learner, course, ...rest } = material;
      await db.collection(materialsPath(learner, course)).doc(id).set(rest);
      return material;
    },
    async updateMaterial(learner, courseId, materialId, patch) {
      const { id: _id, learner: _l, course: _c, ...rest } = patch as Material;
      const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
      await db.collection(materialsPath(learner, courseId)).doc(materialId).update(clean);
    },
    async materialsFor(learner, courseId) {
      const found = await db.collection(materialsPath(learner, courseId)).get();
      return found.docs.map((d) => ({
        id: d.id,
        learner,
        course: courseId,
        ...(d.data() as Omit<Material, "id" | "learner" | "course">),
      }));
    },
    async getMaterial(learner, courseId, materialId) {
      const snap = await db.collection(materialsPath(learner, courseId)).doc(materialId).get();
      if (!snap.exists) return null;
      return {
        id: materialId,
        learner,
        course: courseId,
        ...(snap.data() as Omit<Material, "id" | "learner" | "course">),
      };
    },
    async deleteMaterial(learner, courseId, materialId) {
      await db.collection(materialsPath(learner, courseId)).doc(materialId).delete();
    },
    async appendEvent(event) {
      await db.collection("events").add(event);
    },
    async anonymiseEvents(learner, token) {
      const found = await db.collection("events").where("learner", "==", learner).get();
      await Promise.all(found.docs.map((d) => d.ref.update({ learner: token })));
    },
    async eventsFor(learner) {
      const found = await db.collection("events").where("learner", "==", learner).get();
      return found.docs.map((d) => d.data() as AitutorEvent);
    },
    async allEvents() {
      const found = await db.collection("events").get();
      return found.docs.map((d) => d.data() as AitutorEvent);
    },
  };
}
