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
  chunks: number;
  createdAt: string;
};

/** One searchable piece of one document. Carries its session so an answer built from it
 *  can be attributed without a second lookup. */
export type Chunk = {
  id: string;
  learner: string;
  course: string;
  session: string;
  material: string;
  text: string;
  embedding: number[];
};

/** A chunk plus why it was retrieved. `score` is the fused keyword + similarity score. */
export type Retrieved = Chunk & { score: number; similarity: number; keyword: number };

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

/** Paragraph-first chunking with a little overlap, so a sentence split across a boundary
 *  still appears whole in one of the two chunks. Deliberately simple — tuning this is not
 *  what the demo is testing. */
export function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const clean = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (clean.length === 0) return [];
  const paragraphs = clean.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (current.length > 0 && current.length + p.length + 2 > size) {
      chunks.push(current);
      current = current.slice(Math.max(0, current.length - overlap));
    }
    current = current.length > 0 ? `${current}\n\n${p}` : p;
    while (current.length > size) {
      chunks.push(current.slice(0, size));
      current = current.slice(size - overlap);
    }
  }
  if (current.trim().length > 0) chunks.push(current);
  return chunks.map((c) => c.trim()).filter((c) => c.length > 0);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
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
