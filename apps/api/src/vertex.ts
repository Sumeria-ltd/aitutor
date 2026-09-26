import type { Answer } from "@aitutor/shared";

/** The model layer is a port, so the chat and the indexing path are testable with no
 *  cloud project and no network (ADR 0004 — tests cross real seams, but not paid ones).
 *
 *  Two facts discovered rather than assumed, 2026-09-26:
 *  - `text-embedding-005` is served from europe-west1, alongside Firestore.
 *  - `gemini-2.5-flash` is **not** served from europe-west1. Generation goes to the
 *    `global` endpoint. Getting this wrong returns an HTML 404, not a JSON error, which
 *    is why the two calls below use different hosts on purpose. */

export const EMBED_MODEL = "text-embedding-005";
export const EMBED_DIMS = 768;
export const CHAT_MODEL = "gemini-2.5-flash";
export const EMBED_LOCATION = "europe-west1";
export const CHAT_LOCATION = "global";

export type LabelledChunk = {
  /** The number the model must cite: "Document 3". */
  label: number;
  session: string;
  sessionTitle: string;
  filename: string;
  text: string;
};

export type Ai = {
  embed(texts: string[], kind: "document" | "query"): Promise<number[][]>;
  /** Reads a file already in Cloud Storage and returns its text. Passing the gs:// URI
   *  avoids re-uploading the bytes (CLAUDE.md, platform constraints). */
  extractText(gsUri: string, contentType: string): Promise<string>;
  /** Returns the model's raw structured reply. Citation validation happens in the caller,
   *  never here — the thing being checked must not also be the checker. */
  answer(input: {
    question: string;
    history: { role: "learner" | "tutor"; text: string }[];
    chunks: LabelledChunk[];
  }): Promise<{ text: string; cited: number[]; covered: boolean }>;
};

export type VertexConfig = { project: string; embedLocation?: string; chatLocation?: string };

type TokenSource = () => Promise<string>;

async function adcToken(): Promise<TokenSource> {
  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  return async () => {
    const t = await client.getAccessToken();
    if (!t.token) throw new Error("no access token from ADC");
    return t.token;
  };
}

function host(location: string): string {
  return location === "global"
    ? "https://aiplatform.googleapis.com"
    : `https://${location}-aiplatform.googleapis.com`;
}

async function callVertex(
  token: TokenSource,
  location: string,
  project: string,
  model: string,
  verb: string,
  body: unknown,
): Promise<unknown> {
  const url = `${host(location)}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:${verb}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    throw new Error(`vertex ${model}:${verb} ${res.status} — ${detail}`);
  }
  return res.json();
}

/** The prompt. Every chunk is labelled with its session, and the model is told to cite by
 *  label — it never sees or invents a session id, which is what makes the caller's
 *  validation meaningful (CLAUDE.md, the citation invariant). */
function buildPrompt(input: Parameters<Ai["answer"]>[0]): string {
  const documents = input.chunks
    .map(
      (c) =>
        `--- Document ${c.label} — session "${c.sessionTitle}", file "${c.filename}" ---\n${c.text}`,
    )
    .join("\n\n");
  const conversation = input.history
    .slice(-8)
    .map((t) => `${t.role === "learner" ? "Learner" : "You"}: ${t.text}`)
    .join("\n");

  return `You are helping a learner understand material from their own course. You may use ONLY the documents below. You have never seen this material before and you must not add anything from general knowledge, even if you are confident it is correct.

${documents || "(no documents were found)"}

${conversation ? `Conversation so far:\n${conversation}\n` : ""}
Learner's question: ${input.question}

Reply with JSON only, no markdown fence, in exactly this shape:
{"covered": true|false, "cited": [document numbers you used], "text": "your answer"}

Rules:
- If the documents above do not answer the question, set "covered" to false, set "cited" to [], and in "text" say plainly that their material does not cover it and name what appears to be missing. This is a correct answer, not a failure.
- If they do answer it, set "covered" to true and list in "cited" every document number you actually drew on. Never cite a document you did not use.
- Write "text" in the course's own terms and notation. Be concise.
- Do not mention document numbers in "text" — the learner is shown the sources separately.`;
}

export async function vertexAi(config: VertexConfig): Promise<Ai> {
  const token = await adcToken();
  const embedLocation = config.embedLocation ?? EMBED_LOCATION;
  const chatLocation = config.chatLocation ?? CHAT_LOCATION;

  return {
    async embed(texts, kind) {
      if (texts.length === 0) return [];
      const task = kind === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT";
      const out: number[][] = [];
      // The endpoint caps instances per request; five keeps well inside it.
      for (let i = 0; i < texts.length; i += 5) {
        const batch = texts.slice(i, i + 5);
        const body = {
          instances: batch.map((content) => ({ task_type: task, content })),
        };
        const json = (await callVertex(
          token,
          embedLocation,
          config.project,
          EMBED_MODEL,
          "predict",
          body,
        )) as { predictions: { embeddings: { values: number[] } }[] };
        out.push(...json.predictions.map((p) => p.embeddings.values));
      }
      return out;
    },

    async extractText(gsUri, contentType) {
      const json = (await callVertex(
        token,
        chatLocation,
        config.project,
        CHAT_MODEL,
        "generateContent",
        {
          contents: [
            {
              role: "user",
              parts: [
                { fileData: { fileUri: gsUri, mimeType: contentType } },
                {
                  text: "Transcribe this document to plain text. Preserve headings and the order of the content. Do not summarise, do not comment, do not add anything that is not in the document. Output the text only.",
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 30000,
            temperature: 0,
            thinkingConfig: { thinkingBudget: 0 },
          },
        },
      )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return (json.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("")
        .trim();
    },

    async answer(input) {
      const json = (await callVertex(
        token,
        chatLocation,
        config.project,
        CHAT_MODEL,
        "generateContent",
        {
          contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.2,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 },
          },
        },
      )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const raw = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      return parseAnswer(raw);
    },
  };
}

/** Exported so the parsing is testable without a model. A reply we cannot parse is
 *  treated as "not covered" rather than surfaced as prose — a malformed answer must not
 *  reach the learner looking like a real one. */
export function parseAnswer(raw: string): { text: string; cited: number[]; covered: boolean } {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(stripped) as {
      covered?: unknown;
      cited?: unknown;
      text?: unknown;
    };
    const cited = Array.isArray(parsed.cited)
      ? parsed.cited.filter((n): n is number => typeof n === "number" && Number.isFinite(n))
      : [];
    const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
    const covered = parsed.covered === true && text.length > 0;
    if (text.length === 0) {
      return {
        text: "Something went wrong reading that answer. Try asking again.",
        cited: [],
        covered: false,
      };
    }
    return { text, cited: covered ? cited : [], covered };
  } catch {
    return {
      text: "Something went wrong reading that answer. Try asking again.",
      cited: [],
      covered: false,
    };
  }
}

/** A deterministic stand-in. `embed` hashes words into a vector so that texts sharing
 *  words score as similar, which is enough for the retrieval tests to be meaningful. */
export function fakeAi(overrides: Partial<Ai> = {}): Ai {
  const base: Ai = {
    async embed(texts) {
      return texts.map((t) => {
        const v = new Array(EMBED_DIMS).fill(0);
        for (const word of t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
          let h = 0;
          for (const ch of word) h = (h * 31 + (ch.codePointAt(0) ?? 0)) % EMBED_DIMS;
          v[h] += 1;
        }
        return v;
      });
    },
    async extractText() {
      return "fake extracted text";
    },
    async answer(input) {
      const first = input.chunks[0];
      if (!first) return { text: "Your material does not cover this.", cited: [], covered: false };
      return {
        text: `From your material: ${first.text.slice(0, 80)}`,
        cited: [first.label],
        covered: true,
      };
    },
  };
  return { ...base, ...overrides };
}

export type { Answer };
