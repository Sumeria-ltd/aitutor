import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// One runner, one root command (ADR 0004). Each workspace is a project so that a
// browser-shaped app and a server can differ in environment without differing in entry point.
export default defineConfig({
  test: {
    projects: [
      { test: { name: "shared", root: "./packages/shared", environment: "node" } },
      { test: { name: "api", root: "./apps/api", environment: "node" } },
      {
        plugins: [react()],
        test: { name: "web", root: "./apps/web", environment: "jsdom" },
      },
      {
        test: {
          name: "repo",
          root: ".",
          include: ["tests/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});
