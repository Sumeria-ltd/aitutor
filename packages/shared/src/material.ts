/** Material a learner attached to a session, and the answer shape the chat returns.
 *  Phase D (PRD §10) — the customer capability demo. */

/** `reading` covers extract → chunk → embed. The learner is shown this state rather than
 *  being given a thinner answer from material that is not searchable yet (AIT-82). */
export type MaterialState = "reading" | "ready" | "failed";

export type Material = {
  id: string;
  learner: string;
  course: string;
  /** Set by the learner, never inferred. This is what an answer is attributed to. */
  session: string;
  filename: string;
  contentType: string;
  bytes: number;
  /** Where the original file lives. Kept so a citation can reach the source. */
  gsUri: string;
  state: MaterialState;
  /** Populated when state is "failed", so the learner is told what happened. */
  error?: string;
  /** The ragFile id inside the learner's Vertex AI RAG Engine corpus. Retrieval is scoped to
   *  the ids of the course being asked about, which is how one course is isolated from
   *  another inside one corpus. Absent until the import finishes. */
  ragFileId?: string;
  chunks: number;
  createdAt: string;
};

export type Citation = {
  session: string;
  sessionTitle: string;
  material: string;
  filename: string;
};

export type Answer = {
  text: string;
  citations: Citation[];
  /** False when the learner's material does not cover the question. A correct and
   *  expected outcome, not a failure (intent 0006). */
  covered: boolean;
};

export type ChatTurn = { role: "learner" | "tutor"; text: string };

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

export function isAcceptedType(t: string): boolean {
  return (ACCEPTED_TYPES as readonly string[]).includes(t);
}

/** The keyword half of hybrid search: what share of the question's meaningful words
 *  appear in the chunk. Crude, and it is exactly what similarity is bad at — a course's
 *  own terms, a symbol, a name. */
export function keywordScore(query: string, text: string): number {
  const terms = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])];
  if (terms.length === 0) return 0;
  const haystack = text.toLowerCase();
  const hits = terms.filter((t) => haystack.includes(t)).length;
  return hits / terms.length;
}
