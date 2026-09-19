/** Every screen in every state, with stub props, so the design can be seen without a
 *  Firebase project. Development only: `npm run dev`, then /preview.html. Not built.
 *  Resize the window below 45rem to see the margin fold above the column. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Finish } from "./screens/Finish.js";
import { Home } from "./screens/Home.js";
import { SignIn } from "./screens/SignIn.js";
import "./styles.css";

const never = () => new Promise<string>(() => {});
const fails = async () => {
  throw new Error("preview");
};

const screens: { name: string; note: string; element: React.ReactNode }[] = [
  {
    name: "Sign in",
    note: "Type any address and press the button to reach “Check your email”.",
    element: <SignIn sendLink={async () => {}} />,
  },
  {
    name: "Sign in · the link could not be sent",
    note: "Press the button.",
    element: <SignIn sendLink={fails} />,
  },
  {
    name: "Finish · signing you in",
    note: "The working line; with reduced motion it is still.",
    element: <Finish completeSignIn={never} apiOrigin="" onSignedIn={() => {}} />,
  },
  {
    name: "Finish · the link has expired",
    note: "",
    element: <Finish completeSignIn={fails} apiOrigin="" onSignedIn={() => {}} />,
  },
  {
    name: "Your account",
    note: "Export and delete do nothing here.",
    element: (
      <Home
        learner={{
          id: "preview",
          email: "mariam@uni.edu.jo",
          createdAt: "2026-09-14T10:00:00.000Z",
        }}
        onExport={() => {}}
        onDelete={() => {}}
      />
    ),
  },
];

function Preview() {
  return (
    <>
      {screens.map((s) => (
        <section key={s.name} aria-label={s.name}>
          <div className="banner" style={{ position: "static" }}>
            <span className="label">{s.name}</span>
            {s.note ? <span className="note"> — {s.note}</span> : null}
          </div>
          {s.element}
        </section>
      ))}
    </>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("no #root element");
createRoot(root).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
