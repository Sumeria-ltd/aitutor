import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** A13. ADR 0009 names the failure this guards against: the pipeline calls a Make contract,
 *  so the workflow and the toolchain can drift apart silently. The bodies now run tsc, vite
 *  and vitest, which need an install the workflow did not originally have — and a gate that
 *  stops checking without going red is worse than no gate. */
const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

/** Split a workflow into its jobs, keeping only the ones that invoke a Make target. */
function jobsInvokingMake(yaml: string): string[] {
  return yaml.split(/^ {2}(?=\w[\w-]*:\s*$)/m).filter((b) => b.includes("run: make "));
}

function expectInstallBeforeMake(yaml: string, atLeast: number) {
  const jobs = jobsInvokingMake(yaml);
  expect(jobs.length).toBeGreaterThanOrEqual(atLeast);
  for (const job of jobs) {
    expect(job.indexOf("npm ci"), `a job invokes make without installing:\n${job}`).toBeGreaterThan(
      -1,
    );
    expect(job.indexOf("npm ci")).toBeLessThan(job.indexOf("run: make "));
  }
}

describe("the CI contract", () => {
  it("installs dependencies before invoking a Make target, in every job", () => {
    expectInstallBeforeMake(workflow, 2);
  });

  it("keeps the job names the ruleset requires", () => {
    expect(workflow).toContain("name: build");
    expect(workflow).toContain("name: test");
  });

  it("pins the node version from .nvmrc rather than a literal", () => {
    expect(workflow).toContain("node-version-file: .nvmrc");
  });
});

/** The post-merge gate ran `make build` with nothing installed from 2026-09-12 to 2026-09-19
 *  and failed on every merge to main — the exact drift the test above guards ci.yml against,
 *  in the one workflow it did not read. */
describe("the deployment-ready gate", () => {
  const ready = readFileSync(".github/workflows/deployment-ready.yml", "utf8");

  it("installs dependencies before invoking a Make target", () => {
    expectInstallBeforeMake(ready, 1);
  });

  it("proves the container starts, not only that it builds", () => {
    expect(ready).toContain("check-deployable.sh --image");
    expect(ready).toContain("check-deployable.sh --run");
  });

  it("stores no credential and contacts no cloud", () => {
    expect(ready).not.toMatch(/secrets\.(?!GITHUB_TOKEN)/);
    expect(ready).not.toContain("google-github-actions");
  });
});

/** Deployment is by hand, keyless, and — per ADR 0009 — through the Make contract. Each of
 *  those is a single line in the workflow, and losing any one of them is silent. */
describe("the deploy workflow", () => {
  const deploy = readFileSync(".github/workflows/deploy.yml", "utf8");

  it("is triggered by hand and by nothing else", () => {
    expect(deploy).toMatch(/^on:\s*\n\s+workflow_dispatch:/m);
    expect(deploy).not.toMatch(/^\s+push:/m);
    expect(deploy).not.toMatch(/^\s+pull_request:/m);
    expect(deploy).not.toMatch(/^\s+schedule:/m);
  });

  it("refuses to run from anything but main or a release-candidate tag", () => {
    expect(deploy).toContain("refs/heads/main|refs/tags/rc-*");
  });

  it("authenticates by identity federation, with no stored key", () => {
    expect(deploy).toContain("id-token: write");
    expect(deploy).toContain("workload_identity_provider:");
    expect(deploy).not.toMatch(/secrets\./);
    expect(deploy).not.toMatch(/credentials_json/);
  });

  it("deploys through the Make contract and names no toolchain", () => {
    expect(deploy).toContain("run: make deploy");
    expectInstallBeforeMake(deploy, 1);
    for (const tool of ["gcloud ", "docker ", "firebase "]) {
      expect(deploy, `deploy.yml names a toolchain: ${tool}`).not.toContain(`run: ${tool}`);
    }
  });

  it("takes its settings from repository variables, none of which is a secret", () => {
    for (const v of [
      "GOOGLE_CLOUD_PROJECT",
      "GCP_REGION",
      "GCP_WORKLOAD_IDENTITY_PROVIDER",
      "GCP_DEPLOYER_SERVICE_ACCOUNT",
    ]) {
      expect(deploy).toContain(`vars.${v}`);
    }
  });

  it("names the deploy target the Makefile actually has", () => {
    const makefile = readFileSync("Makefile", "utf8");
    expect(makefile).toMatch(/^deploy:/m);
    expect(makefile).toContain("scripts/deploy.sh");
  });
});
