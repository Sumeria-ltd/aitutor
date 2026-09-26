import { initializeApp } from "firebase/app";
import {
  getAuth,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
} from "firebase/auth";

const EMAIL_KEY = "aitutor.pendingEmail";

let cached: ReturnType<typeof getAuth> | null = null;

/** Memoised: initializeApp throws if called twice with the same name, and every helper
 *  here needs the same instance. */
function auth() {
  if (!cached) {
    const app = initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    });
    cached = getAuth(app);
  }
  return cached;
}

/** A fresh token for every API call. The SDK caches and refreshes it, so this is cheap and
 *  is the only place the web app answers "who is asking" — the server never takes the
 *  learner's identity from anything else. */
export async function idToken(): Promise<string> {
  const user = auth().currentUser;
  if (!user) throw new Error("not signed in");
  return await user.getIdToken();
}

/** There is no password. The link is the credential, which is why recovery and
 *  signing in are the same path. */
export async function sendLink(email: string): Promise<void> {
  await sendSignInLinkToEmail(auth(), email, {
    url: `${window.location.origin}/finish`,
    handleCodeInApp: true,
  });
  window.localStorage.setItem(EMAIL_KEY, email);
}

export function isReturningFromLink(): boolean {
  return isSignInWithEmailLink(auth(), window.location.href);
}

export async function completeSignIn(): Promise<string> {
  const email = window.localStorage.getItem(EMAIL_KEY) ?? "";
  const credential = await signInWithEmailLink(auth(), email, window.location.href);
  window.localStorage.removeItem(EMAIL_KEY);
  return await credential.user.getIdToken();
}
