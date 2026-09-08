import { type EventAttributes, makeEvent } from "@aitutor/shared";
import type { Store } from "./firestore.js";

/** Every event this service writes is stamped with the requirement that caused it. */
export const REQUIREMENT = "0001";

export function emitter(store: Store, now: () => Date = () => new Date()) {
  return async (name: string, learner: string, attributes: EventAttributes = {}) => {
    await store.appendEvent(makeEvent(name, learner, REQUIREMENT, attributes, now()));
  };
}
