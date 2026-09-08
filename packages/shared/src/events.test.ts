import { describe, expect, it } from "vitest";
import { EVENTS, isScalarAttributes, MAX_ATTRIBUTE_STRING, makeEvent } from "./events.js";

// A11 — the guard refuses anything that could carry learner content.
describe("isScalarAttributes", () => {
  it("accepts flat scalars", () => {
    expect(isScalarAttributes({ secondsToComplete: 41, ok: true, tier: "flash", none: null })).toBe(
      true,
    );
  });

  it("rejects a nested object", () => {
    expect(isScalarAttributes({ learner: { email: "a@b.c" } })).toBe(false);
  });

  it("rejects an array", () => {
    expect(isScalarAttributes({ sessions: [1, 2, 3] })).toBe(false);
  });

  it("rejects a string longer than the cap, which is how prose would get in", () => {
    expect(isScalarAttributes({ note: "x".repeat(MAX_ATTRIBUTE_STRING + 1) })).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(isScalarAttributes(["nope"])).toBe(false);
    expect(isScalarAttributes(null)).toBe(false);
  });
});

// A11 — the emit path refuses rather than writing.
describe("makeEvent", () => {
  it("builds a registered event with all five fields", () => {
    const at = new Date("2026-09-08T10:00:00.000Z");
    const event = makeEvent("account.registered", "uid-1", "0001", { secondsToComplete: 41 }, at);
    expect(event).toEqual({
      name: "account.registered",
      occurredAt: "2026-09-08T10:00:00.000Z",
      learner: "uid-1",
      requirement: "0001",
      attributes: { secondsToComplete: 41 },
    });
  });

  // A12 — an unregistered name cannot be emitted.
  it("throws on a name that is not in the registry", () => {
    expect(() => makeEvent("account.bogus", "uid-1", "0001", {})).toThrow(/not in the registry/);
  });

  it("throws on attributes that are not flat scalars", () => {
    expect(() =>
      makeEvent("account.registered", "uid-1", "0001", {
        material: { page: 1 },
      } as never),
    ).toThrow(/flat scalars/);
  });
});

describe("the registry", () => {
  it("holds only the events requirement 0001 emits", () => {
    expect([...EVENTS]).toEqual([
      "account.registration_started",
      "account.registered",
      "account.signed_in",
      "account.exported",
      "account.deleted",
    ]);
  });
});
