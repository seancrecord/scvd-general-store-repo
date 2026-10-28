import { env, SELF } from "cloudflare:test";
import { refreshPublicStatistics } from "@/services/public-statistics";
import type { Env } from "@/types";

/**
 * Existing content/accounting specs publish their seeded books before reading
 * a public page. Cache/cost/failure specs use the real reader without this helper.
 * This is an explicit scheduled-publication step, never a production fallback.
 */
export async function fetchWithPublicStatistics(input: Parameters<typeof SELF.fetch>[0], init?: Parameters<typeof SELF.fetch>[1]) {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (["/", "/stats", "/pulse", "/pulse.json", "/pulse.md", "/menu.json", "/skill.md"].includes(url.pathname)) {
    await refreshPublicStatistics(env as unknown as Env);
  }
  return SELF.fetch(input, init);
}
