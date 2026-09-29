import { type EventAttributes, makeEvent } from "@aitutor/shared";
import type { Store } from "./firestore.ts";

/** The default requirement, which is most of this service. */
export const REQUIREMENT = "0001";

export type Emit = (name: string, learner: string, attributes?: EventAttributes) => Promise<void>;

/** The requirement is an argument rather than a module constant. It was a constant until
 *  requirement 0010 needed to emit, at which point every event this service wrote would
 *  have been stamped `0001` — and requirement 0009 reads this stream and nothing else
 *  (ADR 0008), so a wrong stamp is not a cosmetic problem. 0011 and 0012 would have hit
 *  the same wall.
 *
 *  It is the *last* parameter, with a default, so that `me.ts` — requirement 0001, and
 *  outside this spec's SCOPE — keeps working untouched. Spec 0010's INTERFACE writes the
 *  signature as `emitter(store, requirement, now?)`; the decision it records is that the
 *  requirement is passed in, and the order here honours that while leaving a file the
 *  spec does not list alone. */
export function emitter(
  store: Store,
  now: () => Date = () => new Date(),
  requirement: string = REQUIREMENT,
): Emit {
  return async (name, learner, attributes: EventAttributes = {}) => {
    await store.appendEvent(makeEvent(name, learner, requirement, attributes, now()));
  };
}
