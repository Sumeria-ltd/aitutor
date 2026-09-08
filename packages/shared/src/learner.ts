/** A learner account. The id is the auth uid, so identity and the privacy boundary
 *  are the same key and cannot drift apart (ADR 0006). */
export type Learner = {
  id: string;
  email: string;
  createdAt: string;
};

/** Stated on the sign-in screen before any credential is entered. */
export const PRIVACY_PROMISE = "This is where your material lives. Only you can see it.";

/** The API surface, named once and consumed by both surfaces. Changing a path here
 *  must break the server that mounts it and the client that calls it. */
export const ROUTES = {
  session: "/api/auth/session",
  me: "/api/me",
  export: "/api/me/export",
} as const;
