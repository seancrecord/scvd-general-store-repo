import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
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
          PAY_TO_ADDRESS: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          CDP_API_KEY_ID: "test-key-id",
          CDP_API_KEY_SECRET: "test-key-secret",
          // Test-only ed25519 seed (RFC 8032 test vector). Never a real secret.
          SIGNING_KEY:
            "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
          ADMIN_PASSWORD: "test-admin-password",
          STORE_BASE_URL: "https://scvd.store",
        },
      },
    }),
  ],
});
