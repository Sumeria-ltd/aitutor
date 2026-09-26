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

/** Synchronous, and it touches nothing until a file is actually stored or removed. Same
 *  reason as vertexAi: the API must start and serve every route that does not need a
 *  bucket, even when the bucket or its credentials are unavailable. */
export function cloudStorageFiles(bucketName: string): Files {
  let pending: Promise<{ file(key: string): BucketFile }> | null = null;
  const bucket = async () => {
    pending ??= import("firebase-admin/storage")
      .then((m) => m.getStorage().bucket(bucketName) as unknown as { file(k: string): BucketFile })
      .catch((cause) => {
        pending = null;
        throw cause;
      });
    return await pending;
  };
  return {
    async put(key, body, contentType) {
      const b = await bucket();
      await b.file(key).save(Buffer.from(body), { contentType, resumable: false });
      return `gs://${bucketName}/${key}`;
    },
    async remove(key) {
      const b = await bucket();
      // ignoreNotFound: deletion must be idempotent, because the caller may be retrying
      // after a partial failure and must not be blocked from finishing the job.
      await b.file(key).delete({ ignoreNotFound: true });
    },
  };
}

type BucketFile = {
  save(body: Buffer, opts: { contentType: string; resumable: boolean }): Promise<unknown>;
  delete(opts: { ignoreNotFound: boolean }): Promise<unknown>;
};
