/** Material a learner attached to a session, and the answer shape the chat returns.
 *  Phase D (PRD §10) — the customer capability demo. */

/** `reading` covers extract → chunk → embed. The learner is shown this state rather than
 *  being given a thinner answer from material that is not searchable yet (AIT-82). */
export type MaterialState = "reading" | "ready" | "failed";

/** `learner` is the learner's own account of the session; `course` is what the course
 *  issued. The learner says which. */
export type MaterialAuthor = "learner" | "course";

export function isAuthor(value: unknown): value is MaterialAuthor {
  return value === "learner" || value === "course";
}

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
  /** Whose words these are, declared by the learner and never inferred — not from the
   *  route it arrived by, not from the file type, not from which box it was typed into
   *  (PRD open question 18). Requirement 0005 checks the learner's own account against the
   *  course's material and cannot do that if it cannot tell them apart. */
  author: MaterialAuthor;
  chunks: number;
  createdAt: string;
  /** When the import finished and the material became answerable. `readyAt` minus
   *  `createdAt` is the five-minute bound in PRD §5 — measurable after the fact rather
   *  than only observable live, which is what lets the validator check it at all. */
  readyAt?: string;
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
  /** Material that is still being read. Present so the learner is told the answer was
   *  built from less than they have added, rather than being handed a thinner answer
   *  that looks complete. An empty array and an absent one mean the same thing. */
  pending?: { filename: string }[];
};

export type ChatTurn = { role: "learner" | "tutor"; text: string };

export type NoteCheck = { ok: true; value: string } | { ok: false; reason: string };

/** The note's text, checked and otherwise untouched. **Nothing here rewrites, completes,
 *  extends or tidies what the learner wrote** — AIT-107 counts those at zero, and this is
 *  the only function in the product that handles note text on its way in. */
export function checkNote(raw: unknown): NoteCheck {
  if (typeof raw !== "string") return { ok: false, reason: "a note is required" };
  if (raw.trim().length === 0) return { ok: false, reason: "a note is required" };
  if (new TextEncoder().encode(raw).length > MAX_NOTE_BYTES) {
    return { ok: false, reason: `a note must be ${Math.floor(MAX_NOTE_BYTES / 1024)} KB or less` };
  }
  // Returned exactly as typed. Not trimmed: trailing blank lines are the learner's.
  return { ok: true, value: raw };
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Requirement 0012: notes arrive as a photograph of a handwritten page or as a
  // word-processor file as often as they arrive typed.
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

/** A note is text the learner typed. Generous enough for a term's worth of one session,
 *  small enough that the field cannot become a file store. */
export const MAX_NOTE_BYTES = 256 * 1024;

/** Notes are stored as Markdown, and the object key must carry the extension — RAG Engine
 *  infers the type from it and rejects an import without one. */
export function noteObjectName(title: string): string {
  const stem = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
  return `${stem.length > 0 ? stem.slice(0, 60) : "note"}.md`;
}

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
