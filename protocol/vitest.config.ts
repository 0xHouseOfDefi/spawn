import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["spawn-backend/tests/**/*.test.ts"] },
});
