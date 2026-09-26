import type { Answer, ChatTurn, Course, CourseSession, Material } from "@aitutor/shared";
import { paths, ROUTES } from "@aitutor/shared";

/** The API client. Every call carries the learner's token; nothing here ever sends a
 *  learner id, because the server takes identity from the token alone. */

const ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "";

export type TokenFn = () => Promise<string>;

async function call<T>(token: TokenFn, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${ORIGIN}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await token()}`,
      ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`);
  return body;
}

export function api(token: TokenFn) {
  return {
    listCourses: () => call<{ courses: Course[] }>(token, ROUTES.courses),

    createCourse: (name: string) =>
      call<{ course: Course }>(token, ROUTES.courses, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),

    readCourse: (courseId: string) =>
      call<{ course: Course; sessions: CourseSession[] }>(token, paths.course(courseId)),

    deleteCourse: (courseId: string) =>
      call<void>(token, paths.course(courseId), { method: "DELETE" }),

    addSession: (courseId: string, title: string) =>
      call<{ session: CourseSession }>(token, paths.courseSessions(courseId), {
        method: "POST",
        body: JSON.stringify({ title }),
      }),

    listMaterials: (courseId: string) =>
      call<{ materials: Material[] }>(token, `/api/courses/${courseId}/materials`),

    upload: (courseId: string, sessionId: string, file: File) => {
      const form = new FormData();
      form.set("file", file);
      return call<{ material: Material }>(
        token,
        `/api/courses/${courseId}/sessions/${sessionId}/materials`,
        { method: "POST", body: form },
      );
    },

    deleteMaterial: (courseId: string, materialId: string) =>
      call<void>(token, `/api/courses/${courseId}/materials/${materialId}`, { method: "DELETE" }),

    ask: (courseId: string, message: string, history: ChatTurn[]) =>
      call<{ answer: Answer }>(token, `/api/courses/${courseId}/chat`, {
        method: "POST",
        body: JSON.stringify({ message, history }),
      }),
  };
}

export type Api = ReturnType<typeof api>;
