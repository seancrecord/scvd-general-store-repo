import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    /**
     * The store's suite ONLY. The Tab (tab/) is a filesystem product
     * tested on Node's own runner (npm run tab:test, its own CI
     * step) — vitest's default glob matched tab/tab.test.mjs and
     * tried to run `node:test` inside a Worker isolate, which has
     * neither node:test nor a filesystem. Two runtimes, two runners,
     * stated here rather than discovered again.
     */
    include: ["test/**/*.spec.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        kvNamespaces: ["ORDERS", "GUESTBOOK", "COUNTERS", "PATRONS"],
        bindings: {
          // A plain (nonexistent) wallet address, not a token contract.
          PAY_TO_ADDRESS: "0x1111111111111111111111111111111111111111",
          // Empty = no CDP JWT generation; tests mock the facilitator.
          CDP_API_KEY_ID: "",
          CDP_API_KEY_SECRET: "",
          // Test-only ed25519 seed (RFC 8032 test vector). Never a real secret.
          SIGNING_KEY:
            "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
          ADMIN_PASSWORD: "test-admin-password",
          STORE_BASE_URL: "https://scvd.store",
          HOUSE_SECRET: "test-house-secret",
        },
      },
    }),
  ],
});
