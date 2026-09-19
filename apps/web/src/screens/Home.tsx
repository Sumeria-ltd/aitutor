import type { Learner } from "@aitutor/shared";

export type HomeProps = {
  learner: Learner;
  onExport: () => void;
  onDelete: () => void;
};

export function Home({ learner, onExport, onDelete }: HomeProps) {
  return (
    <main className="page">
      <div className="spread">
        <div className="margin">
          <span className="label">AITutor</span>
        </div>
        <div className="column stack">
          <div className="stack stack--tight">
            <h1 className="ui ui--title">Your account</h1>
            <p className="ui" data-testid="email">
              {learner.email}
            </p>
          </div>
          <div className="actions">
            <button type="button" className="btn btn--quiet" onClick={onExport}>
              Download everything I have added
            </button>
            <button type="button" className="btn btn--text" onClick={onDelete}>
              Delete my account and everything in it
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
