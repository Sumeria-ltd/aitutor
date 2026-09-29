import type { Answer, ChatTurn, CourseSession, Course as CourseT, Material } from "@aitutor/shared";
import { standingOf } from "@aitutor/shared";
import { useCallback, useEffect, useState } from "react";
import type { Api } from "../api.ts";

export type CourseProps = { api: Api; course: CourseT; onBack: () => void };

type Exchange = { id: string; question: string; answer: Answer | null };

export function Course({ api, course, onBack }: CourseProps) {
  const [sessions, setSessions] = useState<CourseSession[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [minutes, setMinutes] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
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
  useEffect(() => {
    if (!reading) return;
    // An interval, not a timeout. A timeout here fired exactly once: the effect only re-runs
    // when `reading` flips, so while material stayed in `reading` nothing rescheduled it and
    // the row sat there forever. An interval keeps firing until `reading` goes false, which
    // is also what the lint rule wants — no `materials` in the dependency list.
    const id = window.setInterval(() => {
      refresh().catch(() => {});
    }, 2000);
    return () => window.clearInterval(id);
  }, [reading, refresh]);

  async function addSession(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length === 0) return;
    try {
      const { session } = await api.addSession(course.id, title, {
        // datetime-local has no zone; the browser's is the learner's, which is the one
        // that matters for "has this class happened yet".
        ...(startsAt ? { startsAt: new Date(startsAt).toISOString() } : {}),
        ...(minutes ? { minutes: Number(minutes) } : {}),
      });
      // Appended, never inserted — the API assigned the position and this mirrors it.
      setSessions((prev) => [...prev, session]);
      setTitle("");
      setStartsAt("");
      setMinutes("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  /** Drag to reorder. The learner's whole order goes in one call, so a reorder cannot
   *  half-apply; on failure the list is put back rather than left half-moved. */
  async function dropOn(index: number) {
    const from = sessions.findIndex((s) => s.id === dragging);
    setDragging(null);
    if (from < 0) return;
    await move(from, index);
  }

  async function move(from: number, index: number) {
    if (from === index) return;
    const next = [...sessions];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(index, 0, moved);

    const before = sessions;
    setSessions(next);
    try {
      await api.reorderSessions(
        course.id,
        next.map((s) => s.id),
      );
    } catch (err) {
      setSessions(before);
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
            {sessions.map((session, index) => (
              // Dragging has no accessible element type to hang these handlers on. The
              // keyboard and screen-reader path to the same reorder is the pair of move
              // buttons in SessionRow, so the gesture is an enhancement and not the only
              // way through.
              // biome-ignore lint/a11y/noStaticElementInteractions: keyboard path is the move buttons in SessionRow
              <div
                key={session.id}
                draggable
                onDragStart={() => setDragging(session.id)}
                onDragEnd={() => setDragging(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void dropOn(index);
                }}
                style={{ opacity: dragging === session.id ? 0.4 : 1 }}
              >
                <SessionRow
                  session={session}
                  materials={materials.filter((m) => m.session === session.id)}
                  onUpload={(file) => upload(session.id, file)}
                  onRemove={removeMaterial}
                  // Dragging is a mouse gesture and nothing else. These two buttons are the
                  // keyboard and screen-reader path to the same reorder — without them the
                  // feature simply does not exist for anyone not using a pointer.
                  onMoveUp={index > 0 ? () => void move(index, index - 1) : undefined}
                  onMoveDown={
                    index < sessions.length - 1 ? () => void move(index, index + 1) : undefined
                  }
                />
              </div>
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
              <div className="spread" style={{ gridTemplateColumns: "1fr auto" }}>
                <div className="field">
                  <label htmlFor="session-when">When (optional)</label>
                  <input
                    id="session-when"
                    className="input"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="session-minutes">Minutes</label>
                  <input
                    id="session-minutes"
                    className="input"
                    type="number"
                    min={1}
                    max={240}
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    placeholder="90"
                    style={{ width: "7rem" }}
                  />
                </div>
              </div>
              <p className="note">
                A term is planned with gaps in it — a session with no date is fine. Drag a session
                to move it; the order you leave is the order you get back.
              </p>
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
  onMoveUp,
  onMoveDown,
}: {
  session: CourseSession;
  materials: Material[];
  onUpload: (file: File) => void;
  onRemove: (materialId: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const inputId = `file-${session.id}`;
  const standing = standingOf(session, materials.length);
  const when = session.startsAt
    ? new Date(session.startsAt).toLocaleString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  return (
    <div className="stack stack--tight">
      <div className="spread" style={{ gridTemplateColumns: "1fr auto" }}>
        <p className="ui strong">{session.title}</p>
        <span>
          <button
            type="button"
            className="btn btn--text"
            onClick={onMoveUp}
            disabled={!onMoveUp}
            aria-label={`Move ${session.title} earlier`}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn btn--text"
            onClick={onMoveDown}
            disabled={!onMoveDown}
            aria-label={`Move ${session.title} later`}
          >
            ↓
          </button>
        </span>
      </div>
      <p className="note">
        {when ? when : "No date yet"}
        {session.minutes ? ` · ${session.minutes} min` : ""}
        {/* A fact, never a verdict, and never totalled — intent 0011's NOT NOW. */}
        {standing === "nothing-captured" ? " · nothing captured" : ""}
      </p>

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
