import { serve } from "@hono/node-server";
import { firebaseVerifier } from "./auth.js";
import { type FirestoreLike, firestoreStore } from "./firestore.js";
import { createApp } from "./routes/me.js";

const { getFirestore } = await import("firebase-admin/firestore");
const { initializeApp, getApps } = await import("firebase-admin/app");
if (getApps().length === 0) initializeApp();

const app = createApp({
  // The client is structurally wider than the port; the port is what the code depends on.
  store: firestoreStore(getFirestore() as unknown as FirestoreLike),
  verifier: await firebaseVerifier(),
});

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port });
console.log(`api listening on ${port}`);
