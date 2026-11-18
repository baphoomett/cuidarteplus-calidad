import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./tests/helpers/setup.js"],
      include: ["tests/**/*.test.{js,jsx}"],
      testTimeout: 20000,
      css: false,
      coverage: {
        provider: "v8",
        // Las pruebas de seguridad/usabilidad que fallan son hallazgos esperados: igual se reporta la cobertura
        reportOnFailure: true,
        include: ["src/**/*.{js,jsx}"],
        reporter: ["text", "text-summary", "lcov", "json-summary"],
        reportsDirectory: "coverage",
        thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
      },
    },
  })
);
