import { describe, expect, it } from "vitest";
import { cloudStorageFiles } from "./files.ts";
import { buildPrompt, CHAT_LOCATION, EMBED_LOCATION, vertexAi } from "./vertex.ts";

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

describe("the prompt answers a message, not a question", () => {
  const prompt = (question: string) =>
    buildPrompt({
      question,
      history: [],
      chunks: [
        {
          label: 1,
          session: "s1",
          sessionTitle: "Session 1 — run of show",
          filename: "week1.pdf",
          text: "the course runs as 13 sessions",
        },
      ],
    });

  /** The message that exposed both defects: three requests in one line, one of them not about
   *  the course at all, and the first version of this prompt refused all three. */
  const MIXED =
    "what is the time now? i need to prepare for an exam on session 2, and i need to build the learning timeline";

  it("tells the model a message may hold several requests, and that refusing all of them is a defect", () => {
    const p = prompt(MIXED);
    expect(p).toContain("more than one request");
    expect(p).toContain("Refusing the whole message because one part is not covered is a defect");
  });

  it("keeps course content sourced only from the documents", () => {
    // The invariant that must not move: a gap in the material is never closed from general
    // knowledge, because the learner cannot tell and would stop checking.
    const p = prompt(MIXED);
    expect(p).toContain("comes ONLY from the documents");
    expect(p).toContain("Never close a gap in the course's material with general knowledge");
  });

  it("requires anything not from the material to be labelled as such", () => {
    // PRD §7 forbids blending *quietly*. This is the "not quietly" half.
    const p = prompt(MIXED);
    expect(p).toContain("Not from your material:");
  });

  it("asks for a partial answer rather than a refusal", () => {
    expect(prompt(MIXED)).toContain("Answer what the documents do support");
  });

  it("tells the model it has no clock, so it does not invent one", () => {
    const p = prompt(MIXED);
    expect(p).toContain("no clock");
    expect(p).toContain("Do not guess");
  });

  it("still carries the labelled documents and never a session id", () => {
    const p = prompt(MIXED);
    expect(p).toContain('Document 1 — session "Session 1 — run of show"');
    // The citation invariant: the model cites positions, and cannot invent an identifier it
    // was never shown (ADR 0017).
    expect(p).not.toContain("s1");
  });
});
