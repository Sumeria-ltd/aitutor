import type { Hono } from "hono";
import { type AuthedEnv, requireAuth, type TokenVerifier } from "../auth.ts";
import type { Store } from "../firestore.ts";
import { dispatch, type JsonRpcRequest, TOOLS, type Tool } from "../mcp.ts";
import type { Rag } from "../rag.ts";

/** MCP over HTTP — one endpoint, JSON-RPC 2.0 in the body.
 *
 *  The transport is deliberately the thin half. Everything that matters is in `mcp.ts`; this
 *  file exists to do two things and nothing else:
 *
 *  - Put `requireAuth` in front, so the learner id handed to the dispatcher comes from a
 *    verified token. **No tool takes a learner id as an argument**, which is what makes an
 *    agent runtime calling this unable to ask for someone else's material even if it tried.
 *  - Return 202 with no body for a notification, because JSON-RPC says a notification gets
 *    no response and a client that receives `{}` for one is entitled to complain.
 *
 *  Batches are accepted because the spec allows them, and are answered with an array of only
 *  the responses that exist — notifications inside a batch contribute nothing. */

export type McpDeps = {
  store: Store;
  verifier: TokenVerifier;
  rag: Rag;
  topK?: number;
  /** Overridable so a test can register a write tool and prove the gate refuses it without
   *  shipping one in `TOOLS`. */
  tools?: Tool[];
};

export const MCP_ROUTES = { rpc: "/api/mcp" } as const;

export function mountMcp(app: Hono<AuthedEnv>, deps: McpDeps) {
  const authed = requireAuth(deps.verifier);
  const tools = deps.tools ?? TOOLS;
  const topK = deps.topK ?? 8;

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

    if (Array.isArray(body)) {
      const out = [];
      for (const one of body as JsonRpcRequest[]) {
        const r = await dispatch(one ?? {}, ctx, tools);
        if (r) out.push(r);
      }
      // An all-notification batch gets nothing back, same as a single notification.
      return out.length === 0 ? c.body(null, 202) : c.json(out);
    }

    const response = await dispatch((body ?? {}) as JsonRpcRequest, ctx, tools);
    return response === null ? c.body(null, 202) : c.json(response);
  });

  return app;
}
