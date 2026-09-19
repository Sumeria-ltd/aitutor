import { PRIVACY_PROMISE } from "@aitutor/shared";
import { useState } from "react";

export type SignInProps = {
  sendLink: (email: string) => Promise<void>;
};

/** One field. There is no password to choose, so there is nothing to forget. */
export function SignIn({ sendLink }: SignInProps) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await sendLink(email);
      setSent(true);
    } catch {
      setError("Check the address and try again.");
    }
  }

  if (sent) {
    return (
      <main className="page">
        <div className="spread">
          <div className="margin">
            <span className="label">AITutor</span>
          </div>
          <div className="column stack stack--tight">
            <h1 className="ui ui--title">Check your email</h1>
            <p className="ui">
              We sent a sign-in link to <span className="strong">{email}</span>. Open it on any
              device to continue.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="spread">
        <div className="margin">
          <span className="label">AITutor</span>
        </div>
        <div className="column stack">
          {/* The promise is the headline: what the account is for, before anything is typed. */}
          <h1 className="ui ui--title" data-testid="privacy-promise">
            {PRIVACY_PROMISE}
          </h1>
          <form onSubmit={submit} className="stack stack--tight">
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                className="input"
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <span className="hint">You’ll get a link. There is no password to choose.</span>
            </div>
            <div className="actions">
              <button type="submit" className="btn">
                Send me a sign-in link
              </button>
            </div>
          </form>
          {error ? (
            <div className="alert" role="alert">
              <p className="ui strong">That link could not be sent.</p>
              <p className="note">{error}</p>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
