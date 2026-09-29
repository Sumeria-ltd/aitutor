import { createHash } from "node:crypto";
import type { Material } from "@aitutor/shared";
import type { Store } from "./firestore.ts";
import type { Rag } from "./rag.ts";
import { readableSet, retrieveFor } from "./readable.ts";

/** The tool surface over a learner's own material, spoken as MCP (JSON-RPC 2.0).
 *
 *  Why this exists as a server rather than as a function the chat calls: the retrieval
 *  already works in-process (`readable.ts`), so this buys nothing for our own chat. It buys
 *  the ability for *something else* — an agent runtime we do not write — to search a
 *  learner's material without being handed the learner's identity to be trusted with.
 *
 *  Three properties this file is responsible for, all structural rather than checked later:
 *
 *  1. **Identity comes from the caller's token, never from the arguments.** There is no
 *     `learnerId` parameter on any tool and there must never be one. The dispatcher is handed
 *     a learner id by the route's auth middleware and closes over it. A tool that accepted an
 *     identity would make every guarantee below a matter of the caller being careful.
 *  2. **Every tool declares whether it reads or writes**, and the type will not let a new one
 *     omit it. Read tools cannot reach a mutating store method because none is in scope here.
 *  3. **A write tool stops for the learner on every execution.** Not once per session, not
 *     once per tool — the grant is bound to the exact arguments of one call, so the second
 *     identical call needs a second grant. See `signature()`.
 *
 *  There are **no write tools today**, deliberately (PRD open question 23: nothing in the
 *  product can change a learner's material on their behalf yet). The gate is built before the
 *  thing it guards, so that adding a write tool without it is impossible rather than merely
 *  discouraged — `requiresGrant` is driven off `access`, not off a per-tool flag someone can
 *  forget. `TOOLS` being free of writes is asserted by a test, so the day one is added the
 *  test names what changed. */

export const MCP_PROTOCOL = "2025-06-18";
export const MCP_SERVER = { name: "aitutor-material", version: "0.1.0" } as const;

export type ToolAccess = "read" | "write";

export type ToolContext = {
  /** From the verified token. Never from tool arguments. */
  learner: string;
  store: Store;
  rag: Rag;
  topK: number;
};

export type JsonObject = Record<string, unknown>;

export type Tool = {
  name: string;
  title: string;
  description: string;
  /** `read` may not mutate; `write` is gated on a per-call grant. No default: a new tool
   *  must say which it is, and the compiler asks. */
  access: ToolAccess;
  inputSchema: JsonObject;
  run(args: JsonObject, ctx: ToolContext): Promise<ToolResult>;
};

export type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: JsonObject;
  isError?: boolean;
};

/** A grant is for one call, identified by the tool and the exact arguments it would run
 *  with. Presenting a grant for `delete_session{id:"a"}` does nothing for
 *  `delete_session{id:"b"}`, and presenting the same grant twice does nothing the second
 *  time unless the learner issued it twice — which is what "every time" means. */
export function signature(name: string, args: JsonObject): string {
  // Hashed as one canonical object rather than two strings joined by a separator: there is
  // then no byte a tool name could contain that would make two different calls agree.
  return createHash("sha256").update(stable({ name, args })).digest("hex").slice(0, 32);
}

/** Key order must not change a signature, or a client could re-serialise its way past the
 *  gate without the learner agreeing to anything. */
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const entries = Object.entries(value as JsonObject).sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
}

export function requiresGrant(tool: Tool): boolean {
  return tool.access === "write";
}

// ---------------------------------------------------------------------------- the tools

const searchMaterial: Tool = {
  name: "search_material",
  title: "Search my course material",
  description:
    "Search the material the learner has attached to sessions of one of their courses. " +
    "Returns passages with the session each came from, so an answer can be attributed. " +
    "Reads only; searches only the calling learner's own material.",
  access: "read",
  inputSchema: {
    type: "object",
    properties: {
      courseId: { type: "string", description: "The course to search within." },
      query: { type: "string", description: "What to look for, in the learner's own words." },
      topK: { type: "integer", minimum: 1, maximum: 20, description: "How many passages." },
    },
    required: ["courseId", "query"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const courseId = str(args.courseId);
    const query = str(args.query);
    if (!courseId || !query) return fail("courseId and query are both required");

    const course = await ctx.store.getCourse(ctx.learner, courseId);
    if (!course) return fail("no such course");

    // The one place that decides what may be read. Not re-derived here.
    const set = await readableSet(ctx.store, ctx.learner, courseId);
    const topK = clamp(args.topK, ctx.topK);

    if (set.allow.length === 0) {
      // Told apart on purpose: "nothing here" and "not finished reading yet" are different
      // facts, and reporting the first when the second is true is the quiet failure
      // requirement 0010 exists to stop.
      const stillReading = set.pending.length > 0;
      return ok(
        stillReading
          ? "Some of this course's material is still being read and none of it is searchable yet."
          : "This course has no searchable material yet.",
        { passages: [], stillReading: set.pending.map((m) => m.filename) },
      );
    }

    const contexts = await retrieveFor(ctx.rag, set, query, topK);
    const sessions = await ctx.store.sessionsFor(ctx.learner, courseId);
    const titles = new Map(sessions.map((s) => [s.id, s.title]));
    const byUri = new Map<string, Material>(set.allow.map((a) => [a.material.gsUri, a.material]));

    const passages = contexts.flatMap((ctx_) => {
      const m = byUri.get(ctx_.sourceUri);
      // retrieveFor has already thrown on anything foreign, so a miss here is a material we
      // hold with a URI we did not expect rather than someone else's. Dropped, not guessed.
      if (!m) return [];
      return [
        {
          text: ctx_.text,
          session: m.session,
          sessionTitle: titles.get(m.session) ?? "a session",
          filename: m.filename,
          author: m.author,
          score: ctx_.score,
        },
      ];
    });

    return ok(
      passages.length === 0
        ? "Nothing in this course's material matches that."
        : `${passages.length} passage(s) from ${new Set(passages.map((p) => p.session)).size} session(s).`,
      {
        passages,
        ...(set.pending.length > 0 ? { stillReading: set.pending.map((m) => m.filename) } : {}),
      },
    );
  },
};

const listCourses: Tool = {
  name: "list_courses",
  title: "List my courses",
  description: "List the calling learner's courses. Reads only.",
  access: "read",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  async run(_args, ctx) {
    const courses = await ctx.store.coursesFor(ctx.learner);
    return ok(courses.length === 0 ? "No courses yet." : `${courses.length} course(s).`, {
      courses: courses.map((c) => ({ id: c.id, name: c.name })),
    });
  },
};

const listSessions: Tool = {
  name: "list_sessions",
  title: "List a course's sessions",
  description:
    "List the sessions of one of the learner's courses, in the order the learner arranged " +
    "them, with how much material each holds. Reads only.",
  access: "read",
  inputSchema: {
    type: "object",
    properties: { courseId: { type: "string" } },
    required: ["courseId"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const courseId = str(args.courseId);
    if (!courseId) return fail("courseId is required");
    const course = await ctx.store.getCourse(ctx.learner, courseId);
    if (!course) return fail("no such course");

    const [sessions, materials] = await Promise.all([
      ctx.store.sessionsFor(ctx.learner, courseId),
      ctx.store.materialsFor(ctx.learner, courseId),
    ]);
    const counts = new Map<string, number>();
    for (const m of materials) counts.set(m.session, (counts.get(m.session) ?? 0) + 1);

    return ok(`${sessions.length} session(s).`, {
      sessions: sessions.map((s) => ({
        id: s.id,
        title: s.title,
        ...(s.startsAt ? { startsAt: s.startsAt } : {}),
        materials: counts.get(s.id) ?? 0,
      })),
    });
  },
};

/** Read-only, all of them. A write tool added here is refused by the dispatcher until it is
 *  called with a grant for its exact arguments — see `dispatch`. */
export const TOOLS: Tool[] = [searchMaterial, listCourses, listSessions];

// ------------------------------------------------------------------------- the dispatcher

export type JsonRpcRequest = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | {
      jsonrpc: "2.0";
      id: string | number | null;
      error: { code: number; message: string; data?: unknown };
    };

export const RPC = {
  parse: -32700,
  invalidRequest: -32600,
  noMethod: -32601,
  badParams: -32602,
  internal: -32603,
} as const;

/** Returns null for a notification, which by JSON-RPC takes no response at all. */
export async function dispatch(
  req: JsonRpcRequest,
  ctx: ToolContext,
  tools: Tool[] = TOOLS,
): Promise<JsonRpcResponse | null> {
  const method = typeof req.method === "string" ? req.method : "";
  const id = idOf(req);
  const notification = id === undefined;

  if (method === "") {
    return notification ? null : err(id ?? null, RPC.invalidRequest, "no method");
  }

  // Notifications: acknowledged by silence. `notifications/initialized` is the only one a
  // client is required to send, and answering it with a result is a protocol error.
  if (notification) return null;

  switch (method) {
    case "initialize":
      return res(id, {
        protocolVersion: MCP_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: MCP_SERVER,
        instructions:
          "Search only the calling learner's own material. Every passage carries the session " +
          "it came from; attribute answers to those sessions and to nothing else. If the " +
          "passages do not cover the question, say so rather than answering from general " +
          "knowledge.",
      });

    case "ping":
      return res(id, {});

    case "tools/list":
      return res(id, {
        tools: tools.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          // Advertised as well as enforced. A client that honours these annotations gives
          // the learner a better experience; a client that ignores them changes nothing,
          // because the dispatcher refuses ungranted writes regardless.
          annotations: {
            readOnlyHint: t.access === "read",
            destructiveHint: t.access === "write",
          },
        })),
      });

    case "tools/call": {
      const params = (req.params ?? {}) as { name?: unknown; arguments?: unknown };
      const name = typeof params.name === "string" ? params.name : "";
      const tool = tools.find((t) => t.name === name);
      if (!tool) return err(id, RPC.badParams, `no such tool: ${name || "(unnamed)"}`);

      const raw = (params.arguments ?? {}) as JsonObject;
      // The grant travels beside the arguments, not inside them, so it can never be
      // mistaken for input a tool reads.
      const { _grant, ...args } = raw as JsonObject & { _grant?: unknown };

      if (requiresGrant(tool)) {
        const need = signature(tool.name, args as JsonObject);
        if (str(_grant) !== need) {
          // Not an RPC error: the call was well-formed and was refused. The client is told
          // exactly what it would have to get agreement for, and the signature it must
          // present — which is bound to these arguments and to no others.
          return res(id, {
            content: [
              {
                type: "text",
                text:
                  `"${tool.title}" would change the learner's material and has not been ` +
                  `agreed to. Show the learner what it would do, ask, and call again with ` +
                  `_grant set to the signature below only if they agree. A grant covers ` +
                  `this one call: the same request made twice needs agreeing to twice.`,
              },
            ],
            structuredContent: {
              permissionRequired: true,
              tool: tool.name,
              title: tool.title,
              arguments: args,
              grantSignature: need,
            },
            isError: true,
          } satisfies ToolResult);
        }
      }

      try {
        return res(id, await tool.run(args as JsonObject, ctx));
      } catch (cause) {
        // An isolation fault must not be reported as a tool result the model can narrate
        // around. It is an incident, and it stops the call.
        const message = cause instanceof Error ? cause.message : "tool failed";
        if (cause instanceof Error && cause.name === "IsolationFault") {
          return err(id, RPC.internal, "withheld", { incident: "isolation" });
        }
        return res(id, fail(message));
      }
    }

    default:
      return err(id, RPC.noMethod, `unsupported method: ${method}`);
  }
}

// -------------------------------------------------------------------------------- helpers

function idOf(req: JsonRpcRequest): string | number | null | undefined {
  const { id } = req;
  if (id === undefined) return undefined;
  if (typeof id === "string" || typeof id === "number" || id === null) return id;
  return null;
}

function res(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function err(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } };
}

function ok(text: string, structuredContent?: JsonObject): ToolResult {
  return { content: [{ type: "text", text }], ...(structuredContent ? { structuredContent } : {}) };
}

function fail(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clamp(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(20, Math.max(1, Math.trunc(value)));
}
