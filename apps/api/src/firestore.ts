import type { AitutorEvent, Learner } from "@aitutor/shared";

/** Storage is a port. Every read is scoped by the owning learner id, so there is no
 *  query shape here that can return another learner's record (ADR 0006). */
export type Store = {
  getLearner(id: string): Promise<Learner | null>;
  createLearner(learner: Learner): Promise<Learner>;
  deleteLearner(id: string): Promise<void>;
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
    get(): Promise<{ docs: { data(): unknown }[] }>;
  };
};

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
