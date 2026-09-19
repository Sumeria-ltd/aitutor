import { PRIVACY_PROMISE, ROUTES } from "@aitutor/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Finish } from "./screens/Finish.tsx";
import { Home } from "./screens/Home.tsx";
import { SignIn } from "./screens/SignIn.tsx";

afterEach(cleanup);

// A5 — one field, and no password anywhere on the screen.
describe("the sign-in screen", () => {
  it("asks for exactly one thing", () => {
    render(<SignIn sendLink={async () => {}} />);
    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(1);
    expect(document.querySelectorAll('input[type="password"]')).toHaveLength(0);
    expect(document.querySelectorAll("input")).toHaveLength(1);
  });

  // A6 — the promise is on screen before a credential is entered.
  it("states what the account is for, before anything is typed", () => {
    render(<SignIn sendLink={async () => {}} />);
    expect(screen.getByTestId("privacy-promise").textContent).toBe(PRIVACY_PROMISE);
  });

  it("sends the link and confirms where it went", async () => {
    const sendLink = vi.fn(async () => {});
    render(<SignIn sendLink={sendLink} />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "learner@example.com" },
    });
    fireEvent.submit(screen.getByRole("button"));
    await waitFor(() => expect(sendLink).toHaveBeenCalledWith("learner@example.com"));
    expect(screen.getByRole("heading").textContent).toBe("Check your email");
  });

  it("says what to do when the link cannot be sent", async () => {
    render(
      <SignIn
        sendLink={async () => {
          throw new Error("nope");
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "learner@example.com" },
    });
    fireEvent.submit(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("try again"));
  });
});

// A4 — the same contract, pinned on this side too.
describe("the shared route contract", () => {
  it("calls the path packages/shared declares", () => {
    expect(ROUTES.session).toBe("/api/auth/session");
  });
});

describe("finishing sign-in", () => {
  it("posts the token to the shared session route", async () => {
    const learner = { id: "uid-a", email: "a@example.com", createdAt: "2026-09-08T10:00:00.000Z" };
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ learner }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSignedIn = vi.fn();

    render(
      <Finish
        completeSignIn={async () => "tok-a"}
        apiOrigin="https://api.example.test"
        onSignedIn={onSignedIn}
      />,
    );

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(learner));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`https://api.example.test${ROUTES.session}`);
    vi.unstubAllGlobals();
  });

  it("tells the learner what to do when the link has expired", async () => {
    render(
      <Finish
        completeSignIn={async () => {
          throw new Error("expired");
        }}
        apiOrigin=""
        onSignedIn={() => {}}
      />,
    );
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("new one"));
  });
});

describe("the account screen", () => {
  it("offers export and deletion in the learner's own words", () => {
    const onExport = vi.fn();
    const onDelete = vi.fn();
    render(
      <Home
        learner={{ id: "uid-a", email: "a@example.com", createdAt: "2026-09-08T10:00:00.000Z" }}
        onExport={onExport}
        onDelete={onDelete}
      />,
    );
    expect(screen.getByTestId("email").textContent).toBe("a@example.com");
    fireEvent.click(screen.getByText("Download everything I have added"));
    fireEvent.click(screen.getByText("Delete my account and everything in it"));
    expect(onExport).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
  });
});
