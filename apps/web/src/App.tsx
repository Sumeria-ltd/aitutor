import type { Learner } from "@aitutor/shared";
import { useCallback, useState } from "react";
import { completeSignIn, isReturningFromLink, sendLink } from "./firebase.js";
import { Finish } from "./screens/Finish.js";
import { Home } from "./screens/Home.js";
import { SignIn } from "./screens/SignIn.js";

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "";

export function App() {
  const [learner, setLearner] = useState<Learner | null>(null);
  const [returning] = useState(() => isReturningFromLink());
  const onSignedIn = useCallback((next: Learner) => setLearner(next), []);

  if (learner) {
    return (
      <Home
        learner={learner}
        onExport={() => window.open(`${API_ORIGIN}/api/me/export`, "_blank")}
        onDelete={() => setLearner(null)}
      />
    );
  }
  if (returning) {
    return (
      <Finish completeSignIn={completeSignIn} apiOrigin={API_ORIGIN} onSignedIn={onSignedIn} />
    );
  }
  return <SignIn sendLink={sendLink} />;
}
