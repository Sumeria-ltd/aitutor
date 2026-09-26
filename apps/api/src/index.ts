import { serve } from "@hono/node-server";
import { firebaseVerifier } from "./auth.ts";
import { type FirestoreLike, firestoreStore } from "./firestore.ts";
import { mountCourses } from "./routes/courses.ts";
import { createApp } from "./routes/me.ts";

const { getFirestore } = await import("firebase-admin/firestore");
const { initializeApp, getApps } = await import("firebase-admin/app");
if (getApps().length === 0) initializeApp();

// The client is structurally wider than the port; the port is what the code depends on.
const store = firestoreStore(getFirestore() as unknown as FirestoreLike);
const verifier = await firebaseVerifier();

const app = createApp({ store, verifier });
mountCourses(app, { store, verifier });

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port });
console.log(`api listening on ${port}`);
