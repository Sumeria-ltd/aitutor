/** Where the original file lives. A port, so upload is testable without a bucket.
 *
 *  Objects are keyed by learner first — `learners/<id>/courses/<id>/<materialId>` — for
 *  the same reason the Firestore paths are: the boundary is the key, not a check someone
 *  has to remember (ADR 0006). */

export type Files = {
  put(key: string, body: Uint8Array, contentType: string): Promise<string>;
  remove(key: string): Promise<void>;
};

/** The extension is not decoration. Vertex AI RAG Engine infers a file's type from it, and an
 *  object without one is rejected at import with failedRagFilesCount=1 and no stated reason —
 *  established the hard way on 2026-09-26. */
export function objectKey(
  learner: string,
  courseId: string,
  materialId: string,
  filename = "",
): string {
  const dot = filename.lastIndexOf(".");
  const ext =
    dot > 0
      ? filename
          .slice(dot)
          .toLowerCase()
          .replace(/[^.a-z0-9]/g, "")
      : "";
  return `learners/${learner}/courses/${courseId}/${materialId}${ext}`;
}

export function inMemoryFiles(): Files & { held(): string[]; body(key: string): string } {
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
    /** What was actually stored, as text. Lets a test assert that a note was kept exactly
     *  as the learner typed it rather than merely that something was written. */
    body(key) {
      const found = held.get(key);
      return found ? new TextDecoder().decode(found.body) : "";
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
