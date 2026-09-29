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
  /** When the class happens, ISO. Absent is normal, not degraded: a term is planned with
   *  gaps in it, and a product that refuses an undated session turns planning into an
   *  errand (intent 0011). */
  startsAt?: string;
  /** How long the class runs. Absent for the same reason. */
  minutes?: number;
  /** The learner's order, and the only thing that orders the list. Dates are shown and
   *  never sort — PRD open question 17 decided the learner's order always wins, which is
   *  also what lets an undated session sit somewhere sensible. */
  position: number;
  createdAt: string;
};

export type ScheduleInput = { startsAt?: unknown; minutes?: unknown };
export type ScheduleCheck =
  | { ok: true; value: { startsAt?: string; minutes?: number } }
  | { ok: false; reason: string };

/** Four hours. Long enough for a lab or a double lecture, short enough that a typo of
 *  minutes-for-hours is caught rather than stored. */
export const MAX_SESSION_MINUTES = 240;

export function checkSchedule(input: ScheduleInput): ScheduleCheck {
  const value: { startsAt?: string; minutes?: number } = {};

  if (input.startsAt !== undefined && input.startsAt !== null && input.startsAt !== "") {
    if (typeof input.startsAt !== "string") return { ok: false, reason: "a date must be text" };
    const when = new Date(input.startsAt);
    if (Number.isNaN(when.getTime())) return { ok: false, reason: "that is not a date" };
    value.startsAt = when.toISOString();
  }

  if (input.minutes !== undefined && input.minutes !== null && input.minutes !== "") {
    const n = typeof input.minutes === "number" ? input.minutes : Number(input.minutes);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      return { ok: false, reason: "a length must be a whole number of minutes" };
    }
    if (n > MAX_SESSION_MINUTES) {
      return { ok: false, reason: `a length must be ${MAX_SESSION_MINUTES} minutes or fewer` };
    }
    value.minutes = n;
  }

  return { ok: true, value };
}

/** Three states, derived and never stored (PRD §7): still to come, happened and holds
 *  something, happened and holds nothing. Only the third is named to the learner, and it
 *  is stated as a fact — the product never totals or scores them (intent 0011 NOT NOW). */
export type SessionStanding = "upcoming" | "captured" | "nothing-captured";

export function standingOf(
  session: Pick<CourseSession, "startsAt" | "minutes">,
  materialCount: number,
  now: Date = new Date(),
): SessionStanding {
  if (materialCount > 0) return "captured";
  if (!session.startsAt) return "upcoming";
  const ends = new Date(session.startsAt).getTime() + (session.minutes ?? 0) * 60_000;
  return ends <= now.getTime() ? "nothing-captured" : "upcoming";
}

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
