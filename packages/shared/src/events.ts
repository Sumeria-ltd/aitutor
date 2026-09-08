/** The measurement event shape fixed by ADR 0008: one append-only stream, five fields,
 *  attributes restricted to scalars so an event can never carry learner content. */

// account.registration_started is deliberately absent: every event carries the owning
// learner (ADR 0008), and at the moment registration starts there is no learner to attribute
// one to. secondsToComplete on account.registered carries the timing signal instead.
export const EVENTS = [
  "account.registered",
  "account.signed_in",
  "account.exported",
  "account.deleted",
] as const;

export type EventName = (typeof EVENTS)[number];

export type Scalar = string | number | boolean | null;
export type EventAttributes = Record<string, Scalar>;

export type AitutorEvent = {
  name: EventName;
  occurredAt: string;
  learner: string;
  requirement: string;
  attributes: EventAttributes;
};

/** Attribute strings hold enum outcomes and identifiers, never prose. The cap is what
 *  stops a free-text field being smuggled in as an "identifier". */
export const MAX_ATTRIBUTE_STRING = 64;

export function isScalarAttributes(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (entry === null) continue;
    const kind = typeof entry;
    if (kind === "number" || kind === "boolean") continue;
    if (kind === "string") {
      if ((entry as string).length > MAX_ATTRIBUTE_STRING) return false;
      continue;
    }
    return false;
  }
  return true;
}

export function isEventName(name: unknown): name is EventName {
  return typeof name === "string" && (EVENTS as readonly string[]).includes(name);
}

/** The only way to construct an event. Refuses an unregistered name or non-scalar
 *  attributes rather than writing them, which is what makes ADR 0008 checkable. */
export function makeEvent(
  name: string,
  learner: string,
  requirement: string,
  attributes: EventAttributes,
  occurredAt: Date = new Date(),
): AitutorEvent {
  if (!isEventName(name)) {
    throw new Error(`event name "${name}" is not in the registry`);
  }
  if (!isScalarAttributes(attributes)) {
    throw new Error(`event "${name}" has attributes that are not flat scalars`);
  }
  return {
    name,
    occurredAt: occurredAt.toISOString(),
    learner,
    requirement,
    attributes,
  };
}
