import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.js"],
    environment: "node",
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: [
        "lib/config.js",
        "lib/errors.js",
        "lib/validators.js",
        "lib/queryAnalyzer.js",
        "lib/modeEnforcer.js",
        "lib/limits.js",
        "lib/paramConverter.js",
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
