import type { Answer, ChatTurn, CourseSession, Course as CourseT, Material } from "@aitutor/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Api } from "../api.ts";

export type CourseProps = { api: Api; course: CourseT; onBack: () => void };

type Exchange = { id: string; question: string; answer: Answer | null };

export function Course({ api, course, onBack }: CourseProps) {
  const [sessions, setSessions] = useState<CourseSession[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [asking, setAsking] = useState(false);

  const refresh = useCallback(async () => {
    const [read, mats] = await Promise.all([
      api.readCourse(course.id),
      api.listMaterials(course.id),
    ]);
    setSessions(read.sessions);
    setMaterials(mats.materials);
    return mats.materials;
  }, [api, course.id]);

  useEffect(() => {
    refresh().catch((e: Error) => setError(e.message));
  }, [refresh]);

  // While anything is still being read, poll. This is what makes "add it and ask about it
  // in the same sitting" visible rather than a guess (AIT-79).
  const reading = materials.some((m) => m.state === "reading");
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!reading) return;
    timer.current = window.setTimeout(() => {
      refresh().catch(() => {});
    }, 2000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [reading, refresh]);

  async function addSession(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length === 0) return;
    try {
      const { session } = await api.addSession(course.id, title);
      setSessions((prev) => [...prev, session]);
      setTitle("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function upload(sessionId: string, file: File) {
    setError(null);
    try {
      await api.upload(course.id, sessionId, file);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function removeMaterial(materialId: string) {
    setError(null);
    try {
      await api.deleteMaterial(course.id, materialId);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const asked = question.trim();
    if (asked.length === 0 || asking) return;
    setAsking(true);
    setQuestion("");
    setExchanges((prev) => [...prev, { id: crypto.randomUUID(), question: asked, answer: null }]);
    const history: ChatTurn[] = exchanges.flatMap((x) =>
      x.answer
        ? [
            { role: "learner" as const, text: x.question },
            { role: "tutor" as const, text: x.answer.text },
          ]
        : [],
    );
    try {
      const { answer } = await api.ask(course.id, asked, history);
      setExchanges((prev) => prev.map((x, i) => (i === prev.length - 1 ? { ...x, answer } : x)));
    } catch (err) {
      setExchanges((prev) =>
        prev.map((x, i) =>
          i === prev.length - 1
            ? { ...x, answer: { text: (err as Error).message, citations: [], covered: false } }
            : x,
        ),
      );
    } finally {
      setAsking(false);
    }
  }

  const ready = materials.filter((m) => m.state === "ready").length;

  return (
    <main className="page">
      <div className="spread">
        <div className="margin">
          <span className="label">Course</span>
        </div>
        <div className="column stack">
          <div className="stack stack--tight">
            <h1 className="ui ui--title">{course.name}</h1>
            <p className="note">
              {sessions.length === 0
                ? "Add the sessions you have attended, then attach what each one gave you."
                : `${sessions.length} session${sessions.length === 1 ? "" : "s"} · ${ready} document${ready === 1 ? "" : "s"} ready to answer from`}
            </p>
          </div>

          {error && (
            <div className="alert" role="alert">
              <p className="ui">{error}</p>
            </div>
          )}
        </div>
      </div>

      <section className="section">
        <div className="spread">
          <div className="margin">
            <span className="label">Sessions</span>
          </div>
          <div className="column stack">
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                materials={materials.filter((m) => m.session === session.id)}
                onUpload={(file) => upload(session.id, file)}
                onRemove={removeMaterial}
              />
            ))}

            <form className="stack" onSubmit={addSession}>
              <div className="field">
                <label htmlFor="session-title">Add a session</label>
                <input
                  id="session-title"
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Week 3 — entropy"
                  maxLength={120}
                />
              </div>
              <div className="actions">
                <button
                  type="submit"
                  className="btn btn--quiet"
                  disabled={title.trim().length === 0}
                >
                  Add session
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="spread">
          <div className="margin">
            <span className="label">Ask</span>
          </div>
          <div className="column stack">
            {ready === 0 ? (
              <div className="empty">
                <p className="ui">Nothing to ask yet.</p>
                <p className="note">
                  Attach a handout or slides to a session above. Once it has been read, you can ask
                  about it here and every answer will name where it came from.
                </p>
              </div>
            ) : (
              <>
                {exchanges.map((x) => (
                  <Exchange key={x.id} exchange={x} />
                ))}

                <form className="stack" onSubmit={ask}>
                  <div className="field">
                    <label htmlFor="question">
                      {exchanges.length === 0 ? "Ask your material" : "Ask a follow-up"}
                    </label>
                    <input
                      id="question"
                      className="input"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="What did we say about indexes in week three?"
                    />
                  </div>
                  <div className="actions">
                    <button
                      type="submit"
                      className="btn"
                      disabled={asking || question.trim().length === 0}
                    >
                      {asking ? "Reading your material…" : "Ask"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="spread">
          <div className="margin" />
          <div className="column actions">
            <button type="button" className="btn btn--text" onClick={onBack}>
              All courses
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function SessionRow({
  session,
  materials,
  onUpload,
  onRemove,
}: {
  session: CourseSession;
  materials: Material[];
  onUpload: (file: File) => void;
  onRemove: (materialId: string) => void;
}) {
  const inputId = `file-${session.id}`;
  return (
    <div className="stack stack--tight">
      <p className="ui strong">{session.title}</p>

      {materials.length === 0 ? (
        <p className="note">Nothing attached yet.</p>
      ) : (
        <ul className="stack stack--tight" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {materials.map((m) => (
            <li key={m.id} className="spread" style={{ gridTemplateColumns: "1fr auto" }}>
              <span className="note">
                {m.filename}
                {m.state === "reading" && " · being read…"}
                {m.state === "ready" && ` · ready · ${m.chunks} pieces`}
                {m.state === "failed" && ` · could not be read — ${m.error ?? "unknown reason"}`}
              </span>
              <button type="button" className="btn btn--text" onClick={() => onRemove(m.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="actions">
        <label className="btn btn--quiet" htmlFor={inputId}>
          Attach material
        </label>
        <input
          id={inputId}
          type="file"
          className="sr-only"
          accept=".pdf,.txt,.md,.pptx"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

function Exchange({ exchange }: { exchange: Exchange }) {
  return (
    <div className="stack stack--tight">
      <p className="ui strong">{exchange.question}</p>
      {exchange.answer === null ? (
        <div className="working">
          <p className="note">Reading your material…</p>
        </div>
      ) : (
        <>
          <p className="read">{exchange.answer.text}</p>
          {exchange.answer.citations.length > 0 && (
            <div className="sources">
              <span className="label">From</span>
              {exchange.answer.citations.map((c) => (
                <span key={`${c.session}-${c.material}`} className="cite">
                  {c.sessionTitle}
                  {c.filename ? ` · ${c.filename}` : ""}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
