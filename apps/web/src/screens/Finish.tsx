import type { Learner } from "@aitutor/shared";
import { ROUTES } from "@aitutor/shared";
import { useEffect, useState } from "react";

export type FinishProps = {
  completeSignIn: () => Promise<string>;
  apiOrigin: string;
  onSignedIn: (learner: Learner) => void;
  startedAt?: number;
};

/** Exchanges the link for a token, then trades the token for the account. */
export function Finish({ completeSignIn, apiOrigin, onSignedIn, startedAt }: FinishProps) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const idToken = await completeSignIn();
        const secondsToComplete = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
        const res = await fetch(`${apiOrigin}${ROUTES.session}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, secondsToComplete }),
        });
        if (!res.ok) throw new Error("session");
        const body = (await res.json()) as { learner: Learner };
        if (!cancelled) onSignedIn(body.learner);
      } catch {
        if (!cancelled) setError("Ask for a new one.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [completeSignIn, apiOrigin, onSignedIn, startedAt]);

  return (
    <main className="page">
      <div className="spread">
        <div className="margin">
          <span className="label">AITutor</span>
        </div>
        <div className="column">
          {error ? (
            <div className="alert" role="alert">
              <p className="ui strong">That link has expired.</p>
              <p className="note">{error}</p>
            </div>
          ) : (
            <div className="working" aria-live="polite">
              <p className="ui">Signing you in…</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
