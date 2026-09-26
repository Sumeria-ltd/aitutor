import { serve } from "@hono/node-server";
import { firebaseVerifier } from "./auth.ts";
import { cloudStorageFiles } from "./files.ts";
import { type FirestoreLike, firestoreStore } from "./firestore.ts";
import { mountChat } from "./routes/chat.ts";
import { mountCourses } from "./routes/courses.ts";
import { mountMaterial } from "./routes/material.ts";
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

const app = createApp({ store, verifier });
mountCourses(app, { store, verifier });
// Both are lazy: nothing here resolves a credential or reaches the network, so the service
// listens even when Vertex or the bucket is unreachable. Only the routes that need them fail.
const ai = vertexAi({ project });
mountMaterial(app, { store, verifier, files: cloudStorageFiles(bucket), ai });
mountChat(app, { store, verifier, ai });

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port });
console.log(`api listening on ${port}`);
