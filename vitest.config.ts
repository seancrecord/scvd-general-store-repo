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
    /**
     * TIMEOUTS CHOSEN, RATHER THAN INHERITED (2026-09-01).
     *
     * CI went red on main at run 2350 with a hook timeout in
     * test/queue-capacity.spec.ts — a file nothing had touched since
     * 08-28, on a commit whose whole diff was a favicon. The run
     * before it was green on the same test code, the file passes 13/13
     * in isolation, and a local full-suite run on the same tree timed
     * out somewhere else entirely (test/passport-decision.spec.ts).
     * Two unrelated files, two machines, no assertion failure and no
     * change to either: that is contention, not a defect, and the
     * thing actually at fault is this config.
     *
     * Vitest's defaults are 5s per test and 10s per hook. Nobody chose
     * them for THIS suite — 404 files and roughly 13 minutes, with
     * imports dominating the wall clock and every file paying for a
     * Worker isolate. Twenty spec files open with a beforeEach that
     * lists a KV prefix and deletes through it; each is a handful of
     * storage round-trips that cost a millisecond on an idle laptop
     * and, on a loaded shared runner, do not. The defaults left them
     * no headroom, so the suite failed a different random file per
     * run and told the reader nothing true about the code.
     *
     * NOT A TEST SKIPPED, DISABLED OR LOOSENED. Every test still runs
     * and every assertion still has to hold; only the patience does.
     * 30s is roughly 20x the slowest legitimate test measured in
     * isolation, which is headroom for a bad neighbour and still short
     * enough that a genuine hang fails the job rather than holding it
     * for the timeout of the whole run.
     *
     * If a test ever needs MORE than this, that is a finding about the
     * test, and it belongs at that test's own call rather than here.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
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
          // A test-only IndexNow key; the route serves it back, nothing pings.
          INDEXNOW_KEY: "0123456789abcdef0123456789abcdef",
          // Empty = no CDP JWT generation; tests mock the facilitator.
          CDP_API_KEY_ID: "",
          CDP_API_KEY_SECRET: "",
          // Test-only ed25519 seed (RFC 8032 test vector). Never a real secret.
          SIGNING_KEY:
            "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
          // A DIFFERENT RFC 8032 vector (TEST 2) for the egress key, so a
          // test that verifies a Web Bot Auth signature against the artifact
          // key by mistake fails instead of passing on a shared key.
          WBA_SIGNING_KEY:
            "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
          ADMIN_PASSWORD: "test-admin-password",
          STORE_BASE_URL: "https://scvd.store",
          HOUSE_SECRET: "test-house-secret",
        },
      },
    }),
  ],
});
