import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/** ADR 0009 says the workflows invoke `make build` and `make test` and nothing else, so the
 *  document checks cannot become a third target. They become tests instead, which keeps them
 *  and puts them in the one runner ADR 0004 requires. If this file is ever unwired from the
 *  vitest projects, the document gate silently stops running — see the spec's RISKS. */
function checkDocs(mode: "--structure" | "--invariants"): { ok: boolean; output: string } {
  try {
    const output = execFileSync("scripts/check-docs.sh", [mode], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, output };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("document invariants", () => {
  it("the chain's structure holds", () => {
    const { ok, output } = checkDocs("--structure");
    expect(ok, output).toBe(true);
  });

  it("every document's id, status and filename agree", () => {
    const { ok, output } = checkDocs("--invariants");
    expect(ok, output).toBe(true);
  });
});
