import { describe, expect, it } from "vitest";

/** The ADR 0015 probe. Imports nothing from `apps/api` or `packages/shared` — see the
 *  README here, and `tests/isolation-boundary.test.ts`, which fails the build if that is
 *  ever broken. Every route below is hard-coded on purpose. */

const BASE = process.env.AITUTOR_BASE_URL ?? "";
const A = process.env.AITUTOR_PROBE_TOKEN_A ?? "";
const B = process.env.AITUTOR_PROBE_TOKEN_B ?? "";
const armed = BASE !== "" && A !== "" && B !== "";

/** Unique enough to be recognisable in an answer, worthless if it leaks. */
const CANARY = process.env.AITUTOR_PROBE_CANARY ?? "zephyrine-quandle-77";

async function as(token: string, path: string, init: RequestInit = {}) {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

const body = async (res: Response) => (await res.text()).toLowerCase();

describe.skipIf(!armed)("isolation probe — ADR 0015", () => {
  it("refuses learner A's token against learner B's course and its material", async () => {
    const mine = await as(A, "/api/courses");
    expect(mine.status).toBe(200);
    const theirs = (await (await as(B, "/api/courses")).json()) as { courses: { id: string }[] };
    const target = theirs.courses[0];
    expect(target, "learner B must hold a course for this attempt to mean anything").toBeTruthy();

    for (const path of [
      `/api/courses/${target?.id}`,
      `/api/courses/${target?.id}/sessions`,
      `/api/courses/${target?.id}/materials`,
    ]) {
      const res = await as(A, path);
      // 404 rather than 403: 403 would confirm it exists.
      expect(res.status, `A reached ${path}`).toBe(404);
    }
  });

  it("refuses an absent, malformed or expired identity", async () => {
    for (const token of ["", "not-a-token", "Bearer.Bearer.Bearer"]) {
      const res = await as(token, "/api/courses");
      expect([401, 403], `token "${token}" was accepted`).toContain(res.status);
    }
  });

  it("never answers A from B's material, even when B's text is unmistakable", async () => {
    const theirs = (await (await as(B, "/api/courses")).json()) as { courses: { id: string }[] };
    const target = theirs.courses[0];
    const mine = (await (await as(A, "/api/courses")).json()) as { courses: { id: string }[] };
    const own = mine.courses[0];
    expect(own, "learner A must hold a course").toBeTruthy();

    // Asked as A, against A's own course, for a word that exists only in B's material.
    const res = await as(A, `/api/courses/${own?.id}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: `what does ${CANARY} mean?` }),
    });
    const text = await body(res);
    expect(text, "A's answer contained B's canary").not.toContain(CANARY.toLowerCase());
    expect(text, "A's answer named B's course id").not.toContain(String(target?.id).toLowerCase());
  });

  it("refuses a corpus or resource identifier injected into the request", async () => {
    const mine = (await (await as(A, "/api/courses")).json()) as { courses: { id: string }[] };
    const own = mine.courses[0];
    const res = await as(A, `/api/courses/${own?.id}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "anything",
        // None of these are part of the request shape. If one is ever honoured, corpus
        // identity has stopped coming from the authenticated caller (ADR 0013 mechanism 1).
        corpus: "projects/aitutor-509111/locations/us-central1/ragCorpora/learner-other",
        learner: "someone-else",
        ragFileIds: ["file-not-mine"],
      }),
    });
    const text = await body(res);
    expect(text).not.toContain(CANARY.toLowerCase());
    expect(text).not.toContain("learner-other");
  });

  it("cannot answer from a document deleted a moment ago, with zero retries", async () => {
    const mine = (await (await as(A, "/api/courses")).json()) as { courses: { id: string }[] };
    const own = mine.courses[0];
    const held = (await (await as(A, `/api/courses/${own?.id}/materials`)).json()) as {
      materials: { id: string; filename: string; state: string }[];
    };
    const victim = held.materials.find((m) => m.state === "ready");
    if (!victim) return; // nothing ready to delete; the attempt is vacuous, not passing

    const gone = await as(A, `/api/courses/${own?.id}/materials/${victim.id}`, {
      method: "DELETE",
    });
    expect(gone.status).toBe(204);

    // The very next request. No sleep, no retry — requirement 0010 allows neither.
    const res = await as(A, `/api/courses/${own?.id}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: `what did ${victim.filename} say?` }),
    });
    const text = await body(res);
    expect(text, "an answer cited a document deleted a moment ago").not.toContain(
      victim.id.toLowerCase(),
    );
  });
});

describe.skipIf(armed)("isolation probe", () => {
  it("is not armed, and a skip is not an attempt", () => {
    // Deliberately a passing test rather than a silent absence. ADR 0015 counts releases
    // with no recorded attempt at zero, and aitutor-platform is what records one.
    expect(armed).toBe(false);
  });
});
