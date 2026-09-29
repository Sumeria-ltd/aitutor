import type { Hono } from "hono";
import { type AuthedEnv, requireAuth, type TokenVerifier } from "../auth.ts";
import type { Store } from "../firestore.ts";
import { dispatch, type JsonRpcRequest, TOOLS, type Tool } from "../mcp.ts";
import type { Rag } from "../rag.ts";

/** MCP over the Streamable HTTP transport — one endpoint, JSON-RPC 2.0 in the body.
 *
 *  The transport is deliberately the thin half. Everything that decides anything is in
 *  `mcp.ts`; this file exists to do four things:
 *
 *  - Put `requireAuth` in front, so the learner id handed to the dispatcher comes from a
 *    verified token. **No tool takes a learner id as an argument**, which is what makes an
 *    agent runtime calling this unable to ask for someone else's material even if it tried.
 *  - Answer in whichever of the two content types the client asked for. The spec lets a
 *    server reply to a POST with either `application/json` or an SSE stream, and clients
 *    differ: the reference Python client sends `Accept: application/json, text/event-stream`
 *    and handles both, while some runtimes only read the stream. Honouring the header rather
 *    than picking one is what keeps this callable by a client we did not write — which is the
 *    entire reason the endpoint exists.
 *  - Return 202 with no body for a notification, because JSON-RPC says a notification gets
 *    no response and a client that receives `{}` for one is entitled to complain.
 *  - Answer `DELETE` so a client can end a session politely, and refuse `GET` explicitly
 *    with 405 rather than a confusing 404: there is no server-initiated stream here, and the
 *    spec's way of saying so is `Method Not Allowed`.
 *
 *  **Sessions are advertised but hold nothing.** `Mcp-Session-Id` is returned on initialize
 *  because clients echo it back and some require it to be present, but no state hangs off it:
 *  every request is authenticated on its own and authorises itself from the token. That is
 *  deliberate — a session that accumulated authority would be a second place where identity
 *  lives, and the first one is the token. */

export type McpDeps = {
  store: Store;
  verifier: TokenVerifier;
  rag: Rag;
  topK?: number;
  /** Overridable so a test can register a write tool and prove the gate refuses it without
   *  shipping one in `TOOLS`. */
  tools?: Tool[];
  /** Session ids are opaque and carry nothing; injectable so a test can assert the header. */
  newSessionId?: () => string;
};

export const MCP_ROUTES = { rpc: "/api/mcp" } as const;
export const SESSION_HEADER = "Mcp-Session-Id";

export function mountMcp(app: Hono<AuthedEnv>, deps: McpDeps) {
  const authed = requireAuth(deps.verifier);
  const tools = deps.tools ?? TOOLS;
  const topK = deps.topK ?? 8;
  const newSessionId = deps.newSessionId ?? (() => crypto.randomUUID());

  app.post(MCP_ROUTES.rpc, authed, async (c) => {
    const learner = c.get("learnerId");
    const body = await c.req.json<unknown>().catch(() => undefined);
    if (body === undefined) {
      return c.json(
        { jsonrpc: "2.0", id: null, error: { code: -32700, message: "invalid JSON" } },
        400,
      );
    }

    const ctx = { learner, store: deps.store, rag: deps.rag, topK };
    // Only when the client cannot take JSON. Preferring JSON where both are acceptable keeps
    // the common path a plain request/response, which is far easier to debug with curl.
    const stream = prefersStream(c.req.header("Accept"));

    const responses = [];
    for (const one of Array.isArray(body) ? (body as JsonRpcRequest[]) : [body as JsonRpcRequest]) {
      const r = await dispatch(one ?? {}, ctx, tools);
      if (r) responses.push(r);
    }

    // Every message was a notification. Nothing to say, and saying `{}` would be wrong.
    if (responses.length === 0) return c.body(null, 202);

    const payload: unknown = Array.isArray(body) ? responses : responses[0];
    const headers: Record<string, string> = isInitialize(body)
      ? { [SESSION_HEADER]: newSessionId() }
      : {};

    if (!stream) return c.json(payload as never, 200, headers);

    // One event, then the stream is done: there is nothing server-initiated to wait for.
    return c.body(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, 200, {
      ...headers,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
  });

  // No server-initiated stream. Saying so plainly beats a 404 that reads like a wrong URL.
  app.get(MCP_ROUTES.rpc, authed, (c) =>
    c.json({ error: "this endpoint does not open a server-initiated stream; POST instead" }, 405),
  );

  // Nothing is stored against a session, so there is nothing to tear down — but a client that
  // ends one politely should not get an error for it.
  app.delete(MCP_ROUTES.rpc, authed, (c) => c.body(null, 204));

  return app;
}

/** True only when the client will not accept JSON. A client that accepts both gets JSON. */
function prefersStream(accept: string | undefined): boolean {
  if (!accept) return false;
  const value = accept.toLowerCase();
  const wantsStream = value.includes("text/event-stream");
  const wantsJson = value.includes("application/json") || value.includes("*/*");
  return wantsStream && !wantsJson;
}

/** The session header belongs on the initialize response and nowhere else. A batch counts if
 *  it contains an initialize, which is unusual but not forbidden. */
function isInitialize(body: unknown): boolean {
  const one = (m: unknown) =>
    typeof m === "object" && m !== null && (m as { method?: unknown }).method === "initialize";
  return Array.isArray(body) ? body.some(one) : one(body);
}
