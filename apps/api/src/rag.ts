/** Vertex AI RAG Engine — corpora, file import, retrieval.
 *
 *  A port, so the routes are testable without a project. `vertexRag()` is the real one.
 *
 *  Facts established by spiking the API on 2026-09-26 rather than read from a doc. Each one
 *  cost a failed attempt, so they are written down:
 *
 *  - **Region is us-central1, not europe-west1.** europe-west1 accepts createRagCorpus with
 *    200 and then never completes the operation — no error, no corpus, forever. The rest of
 *    the project is europe-west1; the corpus is not, deliberately.
 *  - **The project must be in RAG serverless mode.** Spanner mode is the default for new
 *    projects and is allowlist-only in us-central1/us-east1/us-east4 "due to capacity
 *    limitation". Switched once via PATCH on ragEngineConfig.
 *  - **vectorsearch.googleapis.com must be enabled**, or corpus creation fails after ~60s
 *    with PERMISSION_DENIED from VectorSearchService.CreateCollection.
 *  - **The imported object's name must carry a file extension.** Importing
 *    `.../7b9ad771-3acc…` returns failedRagFilesCount=1 with no reason; the identical bytes
 *    at `.../7b9ad771-3acc….pdf` import cleanly. Type is inferred from the extension, so
 *    objectKey() appends it.
 *  - **The RAG service agent needs read on the bucket**:
 *    service-<projectNumber>@gcp-sa-vertex-rag.iam.gserviceaccount.com, storage.objectViewer.
 *
 *  Timings observed: corpus ~20s, import of a 900 KB PDF ~10s. Both are long enough that the
 *  learner must see a state rather than a spinner that lies. */

export const RAG_LOCATION = "us-central1";
export const RAG_API = "v1beta1";

export type RagContext = {
  /** The gs:// URI the chunk came from. This is how a context is mapped back to a material,
   *  and from there to the session an answer is attributed to. */
  sourceUri: string;
  text: string;
  score: number;
};

export type Rag = {
  /** Returns the corpus resource name, creating it if this learner has none. */
  createCorpus(displayName: string): Promise<string>;
  /** Imports one object and returns the ragFile id, which is what scopes later retrieval. */
  importFile(corpus: string, gsUri: string): Promise<string>;
  retrieve(input: {
    corpus: string;
    ragFileIds: string[];
    query: string;
    topK: number;
  }): Promise<RagContext[]>;
  deleteFile(corpus: string, ragFileId: string): Promise<void>;
  deleteCorpus(corpus: string): Promise<void>;
};

type TokenSource = () => Promise<string>;

function lazyToken(): TokenSource {
  let pending: Promise<TokenSource> | null = null;
  const resolve = async (): Promise<TokenSource> => {
    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    const client = await auth.getClient();
    return async () => {
      const t = await client.getAccessToken();
      if (!t.token) throw new Error("no access token from ADC");
      return t.token;
    };
  };
  return async () => {
    // Never cached on failure, and never resolved at construction: the API must start and
    // serve every route that does not touch RAG even with no credentials at all.
    pending ??= resolve().catch((cause) => {
      pending = null;
      throw cause;
    });
    return await (await pending)();
  };
}

export function vertexRag(project: string, location = RAG_LOCATION): Rag {
  const token = lazyToken();
  const base = `https://${location}-aiplatform.googleapis.com/${RAG_API}`;
  const parent = `projects/${project}/locations/${location}`;

  async function call(
    path: string,
    method: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${base}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await token()}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`rag ${method} ${path} ${res.status} — ${text.slice(0, 300)}`);
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  }

  /** Long-running operations are the normal case here, not the exception. */
  async function await_(op: Record<string, unknown>, label: string, timeoutMs: number) {
    const name = op.name as string | undefined;
    if (!name) throw new Error(`${label}: no operation name returned`);
    if (op.done === true) return op;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const next = await call(name, "GET");
      if (next.done === true) {
        const err = next.error as { message?: string } | undefined;
        if (err) throw new Error(`${label}: ${err.message ?? "operation failed"}`);
        return next;
      }
    }
    throw new Error(`${label}: still running after ${Math.round(timeoutMs / 1000)}s`);
  }

  return {
    async createCorpus(displayName) {
      const op = await call(`${parent}/ragCorpora`, "POST", { displayName });
      const done = await await_(op, "create corpus", 180000);
      const name = (done.response as { name?: string } | undefined)?.name;
      if (!name) throw new Error("create corpus: finished with no corpus name");
      return name;
    },

    async importFile(corpus, gsUri) {
      const before = await call(`${corpus}/ragFiles`, "GET");
      const known = new Set(
        ((before.ragFiles as { name?: string }[] | undefined) ?? []).map((f) => f.name ?? ""),
      );
      const op = await call(`${corpus}/ragFiles:import`, "POST", {
        importRagFilesConfig: {
          gcsSource: { uris: [gsUri] },
          ragFileTransformationConfig: {
            ragFileChunkingConfig: { fixedLengthChunking: { chunkSize: 1000, chunkOverlap: 150 } },
          },
        },
      });
      const done = await await_(op, "import file", 600000);
      const result = (done.response ?? {}) as {
        importedRagFilesCount?: string;
        failedRagFilesCount?: string;
      };
      // The API reports a failed import as a *successful* operation with a count. Reading the
      // count is the only way to know it did not work.
      if (result.importedRagFilesCount !== "1") {
        throw new Error(
          `import produced no file (imported=${result.importedRagFilesCount ?? 0}, failed=${result.failedRagFilesCount ?? 0}) — check the object has a file extension and that the RAG service agent can read the bucket`,
        );
      }
      const after = await call(`${corpus}/ragFiles`, "GET");
      const fresh = ((after.ragFiles as { name?: string }[] | undefined) ?? []).find(
        (f) => f.name && !known.has(f.name),
      );
      if (!fresh?.name) throw new Error("import reported success but no new ragFile appeared");
      return fresh.name.split("/").pop() as string;
    },

    async retrieve({ corpus, ragFileIds, query, topK }) {
      // An empty ragFileIds list would retrieve from the *whole* corpus — every course the
      // learner has. Refusing is the safe reading: the caller asked to search nothing.
      if (ragFileIds.length === 0) return [];
      const json = await call(`${parent}:retrieveContexts`, "POST", {
        vertexRagStore: { ragResources: [{ ragCorpus: corpus, ragFileIds }] },
        query: { text: query, ragRetrievalConfig: { topK } },
      });
      const contexts =
        ((json.contexts as { contexts?: unknown[] } | undefined)?.contexts as
          | { sourceUri?: string; text?: string; score?: number }[]
          | undefined) ?? [];
      return contexts.map((c) => ({
        sourceUri: c.sourceUri ?? "",
        text: c.text ?? "",
        score: typeof c.score === "number" ? c.score : 0,
      }));
    },

    async deleteFile(corpus, ragFileId) {
      await call(`${corpus}/ragFiles/${ragFileId}`, "DELETE");
    },

    async deleteCorpus(corpus) {
      await call(`${corpus}?force=true`, "DELETE");
    },
  };
}

/** A deterministic stand-in. Keeps a corpus → files → chunks map in memory and matches on
 *  word overlap, which is enough for the retrieval and isolation tests to mean something. */
export function fakeRag(overrides: Partial<Rag> = {}): Rag {
  const files = new Map<string, { corpus: string; gsUri: string; text: string }>();
  let n = 0;
  const base: Rag = {
    async createCorpus(displayName) {
      return `projects/fake/locations/us-central1/ragCorpora/${displayName.replace(/\W+/g, "-")}`;
    },
    async importFile(corpus, gsUri) {
      const id = `file-${++n}`;
      files.set(id, { corpus, gsUri, text: `contents of ${gsUri}` });
      return id;
    },
    async retrieve({ corpus, ragFileIds, query, topK }) {
      const terms = new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
      return [...files.entries()]
        .filter(([id, f]) => f.corpus === corpus && ragFileIds.includes(id))
        .map(([, f]) => {
          const hay = f.text.toLowerCase();
          const hits = [...terms].filter((t) => hay.includes(t)).length;
          return { sourceUri: f.gsUri, text: f.text, score: hits / Math.max(1, terms.size) };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    },
    async deleteFile(_corpus, ragFileId) {
      files.delete(ragFileId);
    },
    async deleteCorpus(corpus) {
      for (const [id, f] of [...files.entries()]) if (f.corpus === corpus) files.delete(id);
    },
  };
  return { ...base, ...overrides };
}
