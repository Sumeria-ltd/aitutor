import type { Learner } from "@aitutor/shared";

export type HomeProps = {
  learner: Learner;
  onExport: () => void;
  onDelete: () => void;
};

export function Home({ learner, onExport, onDelete }: HomeProps) {
  return (
    <main>
      <h1>Your account</h1>
      <p data-testid="email">{learner.email}</p>
      <button type="button" onClick={onExport}>
        Download everything I have added
      </button>
      <button type="button" onClick={onDelete}>
        Delete my account and everything in it
      </button>
    </main>
  );
}
