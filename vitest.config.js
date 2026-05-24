import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.js", "test/**/*.vitest.test.js", "test/**/*.vitest.js"],
    environment: "node",
  },
});
