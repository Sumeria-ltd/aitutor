/** A course and its sessions. Phase D (PRD §10) — the customer capability demo.
 *
 *  Both records carry `learner`, and every store signature takes the learner first, so
 *  there is no read shape that can reach another learner's course (ADR 0006). The
 *  session a document belongs to is set by the learner and is what an answer is later
 *  attributed to, which is why it is required rather than inferred (PRD §7). */

export type Course = {
  id: string;
  learner: string;
  name: string;
  createdAt: string;
};

/** Named `CourseSession` because `session` already means an auth session on this API. */
export type CourseSession = {
  id: string;
  learner: string;
  course: string;
  title: string;
  createdAt: string;
};

/** Long enough for "Thermodynamics II — Michaelmas 2026", short enough that the field
 *  cannot be used as a notes box. */
export const MAX_NAME = 120;

export type NameCheck = { ok: true; value: string } | { ok: false; reason: string };

export function checkName(raw: unknown): NameCheck {
  if (typeof raw !== "string") return { ok: false, reason: "a name is required" };
  const value = raw.trim();
  if (value.length === 0) return { ok: false, reason: "a name is required" };
  if (value.length > MAX_NAME) {
    return { ok: false, reason: `a name must be ${MAX_NAME} characters or fewer` };
  }
  return { ok: true, value };
}
