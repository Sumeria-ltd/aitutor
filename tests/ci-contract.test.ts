import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** A13. ADR 0009 names the failure this guards against: the pipeline calls a Make contract,
 *  so the workflow and the toolchain can drift apart silently. The bodies now run tsc, vite
 *  and vitest, which need an install the workflow did not originally have — and a gate that
 *  stops checking without going red is worse than no gate. */
const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

describe("the CI contract", () => {
  it("installs dependencies before invoking a Make target, in every job", () => {
    const jobs = workflow.split(/^ {2}(?=\w[\w-]*:\s*$)/m).filter((b) => b.includes("run: make "));
    expect(jobs.length).toBeGreaterThanOrEqual(2);
    for (const job of jobs) {
      expect(
        job.indexOf("npm ci"),
        `a job invokes make without installing:\n${job}`,
      ).toBeGreaterThan(-1);
      expect(job.indexOf("npm ci")).toBeLessThan(job.indexOf("run: make "));
    }
  });

  it("keeps the job names the ruleset requires", () => {
    expect(workflow).toContain("name: build");
    expect(workflow).toContain("name: test");
  });

  it("pins the node version from .nvmrc rather than a literal", () => {
    expect(workflow).toContain("node-version-file: .nvmrc");
  });
});
