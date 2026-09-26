import type {
  AitutorEvent,
  Chunk,
  Course,
  CourseSession,
  Learner,
  Material,
  Retrieved,
} from "@aitutor/shared";
import { cosine, keywordScore } from "@aitutor/shared";

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
  putChunks(chunks: Chunk[]): Promise<void>;
  /** Hybrid retrieval: similarity and keyword, fused. Scoped to one learner and one
   *  course by the path it reads, so there is no filter to forget. */
  searchChunks(input: {
    learner: string;
    courseId: string;
    sessions?: string[];
    queryEmbedding: number[];
    queryText: string;
    limit: number;
  }): Promise<Retrieved[]>;
  appendEvent(event: AitutorEvent): Promise<void>;
  /** Replaces the learner key on every event they produced with a token recorded
   *  nowhere, so the events stay countable and stop being attributable. */
  anonymiseEvents(learner: string, token: string): Promise<void>;
  eventsFor(learner: string): Promise<AitutorEvent[]>;
  allEvents(): Promise<AitutorEvent[]>;
};

/** The fusion rule, shared by both stores so the ranking cannot drift between the one the
 *  tests exercise and the one production runs. Similarity carries most of the weight;
 *  keyword is there for the cases similarity is worst at — a course's own term, a symbol,
 *  a name that means nothing to an embedding model. */
function rank(
  candidates: Chunk[],
  input: { queryEmbedding: number[]; queryText: string; limit: number },
): Retrieved[] {
  return candidates
    .map((k) => {
      const similarity = cosine(input.queryEmbedding, k.embedding);
      const keyword = keywordScore(input.queryText, k.text);
      return { ...k, similarity, keyword, score: 0.75 * similarity + 0.25 * keyword };
    })
    .filter((k) => k.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit);
}

export function inMemoryStore(): Store {
  const learners = new Map<string, Learner>();
  let events: AitutorEvent[] = [];
  let courses: Course[] = [];
  let sessions: CourseSession[] = [];
  let materials: Material[] = [];
  let chunks: Chunk[] = [];
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
      chunks = chunks.filter((k) => !(k.learner === learner && k.course === courseId));
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
      chunks = chunks.filter(
        (k) => !(k.learner === learner && k.course === courseId && k.session === sessionId),
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
      chunks = chunks.filter(
        (k) => !(k.learner === learner && k.course === courseId && k.material === materialId),
      );
    },
    async putChunks(incoming) {
      chunks.push(...incoming);
    },
    async searchChunks(input) {
      const scope = new Set(input.sessions ?? []);
      return rank(
        chunks.filter(
          (k) =>
            k.learner === input.learner &&
            k.course === input.courseId &&
            (scope.size === 0 || scope.has(k.session)),
        ),
        input,
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
/** Chunks sit at course level, not session level, so one read gathers every candidate for
 *  a search. Each chunk carries its own session, which is what the answer is attributed to. */
const chunksPath = (learner: string, courseId: string) =>
  `learners/${learner}/courses/${courseId}/chunks`;

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
      for (const path of [
        chunksPath(learner, courseId),
        materialsPath(learner, courseId),
        sessionsPath(learner, courseId),
      ]) {
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
      for (const path of [chunksPath(learner, courseId), materialsPath(learner, courseId)]) {
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
      // Chunks first. If this order were reversed and the second delete failed, the
      // material would be gone from the learner's list while still answering questions.
      const found = await db.collection(chunksPath(learner, courseId)).get();
      const doomed = found.docs.filter(
        (d) => (d.data() as { material?: string }).material === materialId,
      );
      await Promise.all(
        doomed.map((d) => db.collection(chunksPath(learner, courseId)).doc(d.id).delete()),
      );
      await db.collection(materialsPath(learner, courseId)).doc(materialId).delete();
    },
    async putChunks(chunks) {
      await Promise.all(
        chunks.map((k) => {
          const { id, learner, course, ...rest } = k;
          return db.collection(chunksPath(learner, course)).doc(id).set(rest);
        }),
      );
    },
    async searchChunks(input) {
      // Read the course's chunks and rank in process, rather than using Firestore's vector
      // index. A demo course holds tens to low hundreds of chunks, so this is immediate —
      // and it avoids a composite index that has to be created and finish building before
      // any search works, which is a failure mode you discover on the day. The same rank()
      // runs here and in the in-memory store, so the ordering cannot drift between them.
      // This is the one thing to revisit if a course ever holds thousands of chunks.
      const found = await db.collection(chunksPath(input.learner, input.courseId)).get();
      const scope = new Set(input.sessions ?? []);
      const candidates = found.docs
        .map((d) => ({
          id: d.id,
          learner: input.learner,
          course: input.courseId,
          ...(d.data() as Omit<Chunk, "id" | "learner" | "course">),
        }))
        .filter((k) => scope.size === 0 || scope.has(k.session));
      return rank(candidates, input);
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
