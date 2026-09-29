import type { Material } from "@aitutor/shared";
import type { Store } from "./firestore.ts";
import type { Rag, RagContext } from "./rag.ts";

/** What a request is permitted to read — requirement 0010, Spec 0010.
 *
 *  Every reader of a learner's material takes its set from here and nothing else. That is
 *  the whole design: three guarantees enforced in one place rather than in each of the
 *  four requirements that will read material (0005, 0006, 0007, 0008).
 *
 *  Scope is an **allow-list** of the ragFile ids the learner holds right now, not a
 *  metadata filter (ADR 0016). The two fail in opposite directions and only one of them
 *  fails safely: a forgotten deny entry lets a deleted document keep answering questions,
 *  while a forgotten allow entry merely fails to answer. */

export type ReadableSet = {
  /** The learner's own corpus. Empty when they have none yet — never another learner's. */
  corpus: string;
  allow: { ragFileId: string; material: Material }[];
  /** Still being read. Returned rather than discarded so a caller can tell the learner the
   *  answer was built from less than they have added (PRD §5, AIT-82). A caller that
   *  ignores this cannot satisfy that line, and the type makes ignoring it visible. */
  pending: Material[];
  failed: Material[];
};

/** Raised when a retrieval returns something the caller does not own. Never a retry: the
 *  answer is withheld and this is reported as an incident (ADR 0013 mechanism 2).
 *  A filter that silently dropped the context would be a leak nobody hears about. */
export class IsolationFault extends Error {
  // A declared field and an assignment, not a parameter property: Node's type stripping
  // rejects `constructor(readonly x: string)` outright and the service fails to start.
  readonly sourceUri: string;

  constructor(sourceUri: string) {
    super(`retrieval returned a context the caller does not own: ${sourceUri}`);
    this.name = "IsolationFault";
    this.sourceUri = sourceUri;
  }
}

export async function readableSet(
  store: Store,
  learner: string,
  courseId: string,
): Promise<ReadableSet> {
  const [owner, materials] = await Promise.all([
    store.getLearner(learner),
    store.materialsFor(learner, courseId),
  ]);

  const allow: { ragFileId: string; material: Material }[] = [];
  const pending: Material[] = [];
  const failed: Material[] = [];

  for (const m of materials) {
    if (m.state === "reading") {
      pending.push(m);
    } else if (m.state === "ready" && m.ragFileId) {
      allow.push({ ragFileId: m.ragFileId, material: m });
    } else {
      // `failed`, or `ready` with no ragFile id — an import that reported success and
      // recorded nothing. Not retrievable either way, and not quietly treated as ready.
      failed.push(m);
    }
  }

  const corpus = owner?.corpus ?? "";
  // No corpus means nothing is retrievable, so nothing is allowed. Keeping the invariant
  // "a non-empty allow-list implies a corpus" holds means a caller cannot pass a set that
  // looks readable and is not. A ready material with a ragFile id and no corpus is an
  // inconsistent state — a ragFile only exists inside one — and this is where it stops.
  return { corpus, allow: corpus === "" ? [] : allow, pending, failed };
}

/** The only permitted entry to `Rag.retrieve`. */
export async function retrieveFor(
  rag: Rag,
  set: ReadableSet,
  query: string,
  topK: number,
): Promise<RagContext[]> {
  // An empty allow-list would otherwise search the whole corpus — every course the learner
  // has. Refusing is the safe reading: the caller asked to search nothing.
  if (set.corpus === "" || set.allow.length === 0) return [];

  const contexts = await rag.retrieve({
    corpus: set.corpus,
    ragFileIds: set.allow.map((a) => a.ragFileId),
    query,
    topK,
  });

  const mine = new Set(set.allow.map((a) => a.material.gsUri));
  for (const ctx of contexts) {
    if (!mine.has(ctx.sourceUri)) throw new IsolationFault(ctx.sourceUri);
  }
  return contexts;
}
