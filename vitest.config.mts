import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // Read the "@/..." import alias from tsconfig.json.
  resolve: { tsconfigPaths: true },
  test: {
    // The engine and flow code need no browser. Component tests ask for one
    // themselves with a `// @vitest-environment jsdom` line at the top.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
