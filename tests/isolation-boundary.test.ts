import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** ADR 0015 requires the isolation probe to be a black-box adversary: it speaks only HTTP
 *  and must not share the assumptions of the code it attacks. That is a repository rule
 *  with a check behind it, in the manner of `tests/ci-contract.test.ts` — a convention
 *  nobody enforces is a convention that erodes the first time someone is in a hurry.
 *
 *  The failure this prevents is named in PRD §8 and is worse than a leak: a probe that
 *  keeps passing after the thing it probes has been rewritten. A probe that imports the
 *  route table follows a rename silently; one that hard-codes the surface goes red and
 *  makes a human look. */

const PROBE_DIR = join(import.meta.dirname, "isolation");
const FORBIDDEN = [
  "apps/api",
  "packages/shared",
  "@aitutor/shared",
  "../../apps",
  "../../packages",
];

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

describe("the isolation probe's independence", () => {
  const sources = filesUnder(PROBE_DIR).filter((f) => f.endsWith(".ts"));

  it("has something to check", () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN)("imports nothing from %s", (needle) => {
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      // Import and require forms both. A probe that reached into the application would be
      // testing its own assumptions rather than the deployed surface.
      const offending = text
        .split("\n")
        .filter((line) => /\b(import|require)\b/.test(line) && line.includes(needle));
      expect(offending, `${file} imports ${needle}`).toEqual([]);
    }
  });

  it("talks to a base URL it is given rather than one it assumes", () => {
    const text = sources.map((f) => readFileSync(f, "utf8")).join("\n");
    expect(text).toContain("AITUTOR_BASE_URL");
    // A hard-coded production host would make the probe unrunnable anywhere else, and
    // ADR 0015 leaves the production-versus-staging question open for aitutor-platform.
    expect(text).not.toMatch(/https:\/\/[a-z0-9-]+\.(run\.app|web\.app)/);
  });
});
