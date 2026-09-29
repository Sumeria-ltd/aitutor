import { serve } from "@hono/node-server";
import { firebaseVerifier } from "./auth.ts";
import { emitter } from "./events.ts";
import { cloudStorageFiles } from "./files.ts";
import { type FirestoreLike, firestoreStore } from "./firestore.ts";
import { vertexRag } from "./rag.ts";
import { mountChat } from "./routes/chat.ts";
import { mountCourses } from "./routes/courses.ts";
import { mountMaterial } from "./routes/material.ts";
import { mountMcp } from "./routes/mcp.ts";
import { createApp } from "./routes/me.ts";
import { vertexAi } from "./vertex.ts";

const { getFirestore } = await import("firebase-admin/firestore");
const { initializeApp, getApps } = await import("firebase-admin/app");
if (getApps().length === 0) initializeApp();

// The client is structurally wider than the port; the port is what the code depends on.
const store = firestoreStore(getFirestore() as unknown as FirestoreLike);
const verifier = await firebaseVerifier();

const project = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? "aitutor-509111";
const bucket = process.env.MATERIAL_BUCKET ?? `${project}-material`;

// All three are lazy: nothing here resolves a credential or reaches the network, so the
// service listens even when Vertex or the bucket is unreachable. Only the routes that need
// them fail.
const ai = vertexAi({ project });
const rag = vertexRag(project);
const files = cloudStorageFiles(bucket);

const app = createApp({ store, verifier });
// Courses take rag and files so that deleting a session or a course frees the bytes, not
// only the records — spec 0010.
mountCourses(app, { store, verifier, rag, files });
mountMaterial(app, {
  store,
  verifier,
  files,
  rag,
  // Requirement 0010's own events, not 0001's (ADR 0008).
  emit: emitter(store, () => new Date(), "0010"),
});
mountChat(app, { store, verifier, ai, rag });
// The same retrieval, spoken as MCP so an agent runtime can call it. Identity comes from the
// caller's token inside mountMcp; no tool takes a learner id.
mountMcp(app, { store, verifier, rag });

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port });
console.log(`api listening on ${port}`);
