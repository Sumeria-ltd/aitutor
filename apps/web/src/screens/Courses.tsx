import type { Course } from "@aitutor/shared";
import { useEffect, useState } from "react";
import type { Api } from "../api.ts";

export type CoursesProps = {
  api: Api;
  onOpen: (course: Course) => void;
  onAccount: () => void;
};

export function Courses({ api, onOpen, onAccount }: CoursesProps) {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listCourses()
      .then((r) => setCourses(r.courses))
      .catch((e: Error) => setError(e.message));
  }, [api]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { course } = await api.createCourse(name);
      setCourses((prev) => [...(prev ?? []), course]);
      setName("");
      onOpen(course);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="spread">
        <div className="margin">
          <span className="label">AITutor</span>
        </div>
        <div className="column stack">
          <div className="stack stack--tight">
            <h1 className="ui ui--title">Your courses</h1>
            <p className="note">
              A course holds the sessions you attend, and the material from each one.
            </p>
          </div>

          {error && (
            <div className="alert" role="alert">
              <p className="ui">{error}</p>
            </div>
          )}

          {courses === null ? (
            <div className="working">
              <p className="note">Looking for your courses…</p>
            </div>
          ) : courses.length === 0 ? (
            <div className="empty">
              <p className="ui">You have not set up a course yet.</p>
              <p className="note">Name the first one below — you can add its sessions next.</p>
            </div>
          ) : (
            <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {courses.map((course) => (
                <li key={course.id}>
                  <button
                    type="button"
                    className="btn btn--quiet btn--wide"
                    onClick={() => onOpen(course)}
                  >
                    {course.name}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form className="stack" onSubmit={create}>
            <div className="field">
              <label htmlFor="course-name">Add a course</label>
              <input
                id="course-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Thermodynamics II"
                maxLength={120}
              />
            </div>
            <div className="actions">
              <button type="submit" className="btn" disabled={busy || name.trim().length === 0}>
                {busy ? "Adding…" : "Add course"}
              </button>
            </div>
          </form>

          <div className="actions">
            <button type="button" className="btn btn--text" onClick={onAccount}>
              Your account
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
