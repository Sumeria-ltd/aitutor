import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";
import { afterAll, describe, expect, it } from "vitest";

/** The API is a process before it is anything else. Vitest resolves imports for the code it
 *  runs, so a suite can be green while `node apps/api/src/index.ts` — which is what Cloud Run
 *  runs — exits at startup. That happened on 2026-09-19: relative imports named `.js` files
 *  that exist only as `.ts`, Node's type stripping does not rewrite extensions, and the first
 *  deploy failed with ERR_MODULE_NOT_FOUND. ADR 0004 asks for tests that cross real seams;
 *  this one crosses the seam between the runner and the runtime.
 *
 *  No credential is needed: firebase-admin's clients are lazy, so the process listens
 *  without ever contacting Google, and /api/me answers 401 for a request with no token. */

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

let child: ChildProcess | undefined;
afterAll(() => {
  child?.kill();
});

describe("the API process", () => {
  it("starts under Node type stripping and answers on PORT, with no credential", async () => {
    const port = await freePort();
    child = spawn("node", ["--experimental-strip-types", "apps/api/src/index.ts"], {
      env: { ...process.env, PORT: String(port), GOOGLE_CLOUD_PROJECT: "api-starts-test" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    child.stdout?.on("data", (d) => {
      output += d;
    });
    child.stderr?.on("data", (d) => {
      output += d;
    });

    const exited = new Promise<string>((resolve) => {
      child?.once("exit", (code) =>
        resolve(`process exited with ${code} before listening:\n${output}`),
      );
    });
    const listening = (async () => {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        if (output.includes(`api listening on ${port}`)) return "listening";
        await new Promise((r) => setTimeout(r, 100));
      }
      return `did not listen within 10s:\n${output}`;
    })();

    expect(await Promise.race([exited, listening])).toBe("listening");

    const res = await fetch(`http://127.0.0.1:${port}/api/me`);
    expect(res.status).toBe(401);
  }, 15_000);
});
