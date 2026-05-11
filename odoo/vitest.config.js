import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.js"],
    environment: "node",
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["lib/**/*.js"],
      exclude: [
        "**/*.test.js",
        // instructions.js is a static cheatsheet string — no executable logic to cover
        "lib/instructions.js",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
