/** Where the original file lives. A port, so upload is testable without a bucket.
 *
 *  Objects are keyed by learner first — `learners/<id>/courses/<id>/<materialId>` — for
 *  the same reason the Firestore paths are: the boundary is the key, not a check someone
 *  has to remember (ADR 0006). */

export type Files = {
  put(key: string, body: Uint8Array, contentType: string): Promise<string>;
  remove(key: string): Promise<void>;
};

export function objectKey(learner: string, courseId: string, materialId: string): string {
  return `learners/${learner}/courses/${courseId}/${materialId}`;
}

export function inMemoryFiles(): Files & { held(): string[] } {
  const held = new Map<string, { body: Uint8Array; contentType: string }>();
  return {
    async put(key, body, contentType) {
      held.set(key, { body, contentType });
      return `gs://in-memory/${key}`;
    },
    async remove(key) {
      held.delete(key);
    },
    held() {
      return [...held.keys()];
    },
  };
}

export async function cloudStorageFiles(bucketName: string): Promise<Files> {
  const { getStorage } = await import("firebase-admin/storage");
  const bucket = getStorage().bucket(bucketName);
  return {
    async put(key, body, contentType) {
      await bucket.file(key).save(Buffer.from(body), { contentType, resumable: false });
      return `gs://${bucketName}/${key}`;
    },
    async remove(key) {
      // ignoreNotFound: deletion must be idempotent, because the caller may be retrying
      // after a partial failure and must not be blocked from finishing the job.
      await bucket.file(key).delete({ ignoreNotFound: true });
    },
  };
}
