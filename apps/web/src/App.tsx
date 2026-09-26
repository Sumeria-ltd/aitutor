import type { Course as CourseT, Learner } from "@aitutor/shared";
import { useCallback, useMemo, useState } from "react";
import { api } from "./api.ts";
import { completeSignIn, idToken, isReturningFromLink, sendLink } from "./firebase.ts";
import { Course } from "./screens/Course.tsx";
import { Courses } from "./screens/Courses.tsx";
import { Finish } from "./screens/Finish.tsx";
import { Home } from "./screens/Home.tsx";
import { SignIn } from "./screens/SignIn.tsx";

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "";

type View = { at: "courses" } | { at: "course"; course: CourseT } | { at: "account" };

export function App() {
  const [learner, setLearner] = useState<Learner | null>(null);
  const [returning] = useState(() => isReturningFromLink());
  const [view, setView] = useState<View>({ at: "courses" });
  const onSignedIn = useCallback((next: Learner) => setLearner(next), []);
  const client = useMemo(() => api(idToken), []);

  if (!learner) {
    if (returning) {
      return (
        <Finish completeSignIn={completeSignIn} apiOrigin={API_ORIGIN} onSignedIn={onSignedIn} />
      );
    }
    return <SignIn sendLink={sendLink} />;
  }

  if (view.at === "course") {
    return <Course api={client} course={view.course} onBack={() => setView({ at: "courses" })} />;
  }

  if (view.at === "account") {
    return (
      <Home
        learner={learner}
        onExport={() => window.open(`${API_ORIGIN}/api/me/export`, "_blank")}
        onDelete={() => setLearner(null)}
      />
    );
  }

  return (
    <Courses
      api={client}
      onOpen={(course) => setView({ at: "course", course })}
      onAccount={() => setView({ at: "account" })}
    />
  );
}
