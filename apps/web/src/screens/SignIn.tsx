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
      setError("That link could not be sent. Check the address and try again.");
    }
  }

  if (sent) {
    return (
      <main>
        <h1>Check your email</h1>
        <p>We sent a sign-in link to {email}. Open it on any device to continue.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>AITutor</h1>
      <p data-testid="privacy-promise">{PRIVACY_PROMISE}</p>
      <form onSubmit={submit}>
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit">Send me a sign-in link</button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
