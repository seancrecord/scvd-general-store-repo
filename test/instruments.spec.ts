import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { freeInstrumentUsage } from "@/services/instruments";
import type { Observatory } from "@/services/observatory";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const AUTH = { Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`, Accept: "text/html" };

const sample: Observatory = {
  computed_at: "2026-09-04T00:00:00.000Z",
  months: [{
    month: "2026-09", organic_visits: 0, truncated: false,
    surfaces: [
      { surface: "mcp:tool:preflight_endpoint", organic: 45, by_channel: { mcp: 45 }, house: 0, infrastructure: 0 },
      { surface: "mcp:tool:check_before_you_pay", organic: 24, by_channel: { mcp: 24 }, house: 0, infrastructure: 0 },
      { surface: "preflight:batch", organic: 3, by_channel: { direct: 3 }, house: 0, infrastructure: 1 },
      { surface: "mcp:tool:buy_observation", organic: 18, by_channel: { mcp: 18 }, house: 0, infrastructure: 0 },
      { surface: "menu.json", organic: 885, by_channel: { direct: 169 }, house: 0, infrastructure: 291 },
      { surface: "mcp:initialize", organic: 1613, by_channel: { mcp: 1613 }, house: 0, infrastructure: 0 },
    ],
  }],
  counted_paths: {}, floors: { porch_writes_per_minute: 0, ledger_key_cap: 0, note: "" },
  house_flag_policy: "", what_this_is: "", what_this_is_not: "", corrections: "",
};

describe("the free instruments, sorted out of the observatory", () => {
  it("counts the free roster and the paid tools, and nothing else", () => {
    const u = freeInstrumentUsage(sample);
    const m = u.months[0]!;
    expect(m.free.map((s) => s.surface)).toEqual(["mcp:tool:preflight_endpoint", "mcp:tool:check_before_you_pay", "preflight:batch"]);
    expect(m.free_total).toBe(72);
    expect(m.free_by_channel).toEqual({ mcp: 69, direct: 3 });
    expect(m.paid_tool_calls).toBe(18);
    // Handshakes and the menu are neither: the noise stays out.
    expect(JSON.stringify(m)).not.toContain("mcp:initialize");
  });

  it("renders behind the keeper's door", async () => {
    const page = await SELF.fetch("https://scvd.store/admin/instruments", { headers: AUTH });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Free instruments");
  });
});
