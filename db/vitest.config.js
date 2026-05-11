import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.js"],
    environment: "node",
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["lib/**/*.js", "drivers/**/*.js"],
      exclude: [
        "**/*.test.js",
        // TODO: write tests for these and drop from exclude
        "lib/connectionManager.js",
        "lib/resourceHandlers.js",
        "lib/toolHandlers.js",
        "drivers/**",
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
