import { describe, expect, it } from "vitest";
import { cloudStorageFiles } from "./files.ts";
import { CHAT_LOCATION, EMBED_LOCATION, vertexAi } from "./vertex.ts";

/** Constructing the model and file clients must not resolve a credential or reach the
 *  network. This was a real failure: resolving ADC eagerly meant the API refused to listen
 *  at all when credentials were missing, so a blip at boot took down every route including
 *  the ones that never touch Vertex. tests/api-starts.test.ts catches it end to end by
 *  spawning the server; these catch it here, where the cause is obvious. */
describe("clients are inert until used", () => {
  it("builds the Vertex client with no credentials present", () => {
    expect(() => vertexAi({ project: "no-such-project" })).not.toThrow();
  });

  it("builds the file client with no bucket and no credentials", () => {
    expect(() => cloudStorageFiles("no-such-bucket")).not.toThrow();
  });

  it("both are synchronous — an await here would put credential work on the boot path", () => {
    expect(vertexAi({ project: "p" })).not.toBeInstanceOf(Promise);
    expect(cloudStorageFiles("b")).not.toBeInstanceOf(Promise);
  });
});

describe("model placement", () => {
  // Gemini is not served from europe-west1 and answers there with an HTML 404 rather than a
  // JSON error, which is easy to misread as a bad request. The split is deliberate.
  it("embeds beside the data and generates at the global endpoint", () => {
    expect(EMBED_LOCATION).toBe("europe-west1");
    expect(CHAT_LOCATION).toBe("global");
  });
});
