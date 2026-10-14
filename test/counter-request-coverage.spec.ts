import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { app } from "@/index";
import * as listing from "@/lib/kv-list";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const bindings = env as unknown as Env;
afterEach(() => vi.restoreAllMocks());

it.each(["capped", "unreadable"])("carries a %s request scan through the real counter handler", async (kind) => {
  const original = listing.listKeys;
  vi.spyOn(listing, "listKeys").mockImplementation((namespace, options) =>
    options.prefix === KV_KEYS.requestPrefix
      ? Promise.resolve({ names: kind === "unreadable" ? [KV_KEYS.commissionRequest("absent_row")] : [], truncated: kind === "capped" })
      : original(namespace, options));
  const ctx = createExecutionContext();
  const response = await app.fetch(new Request("https://scvd.store/admin/counter", {
    headers: { Authorization: `Basic ${btoa(`keeper:${bindings.ADMIN_PASSWORD}`)}` },
  }), bindings, ctx);
  await waitOnExecutionContext(ctx);
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain("Partial reading");
  expect(html).not.toContain("No required work in this reading.");
});
