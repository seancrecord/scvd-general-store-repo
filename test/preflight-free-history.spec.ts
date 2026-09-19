import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { PREFLIGHT_BATTERY, PREFLIGHT_BATTERY_NEXT, theRestOfTheLadder } from "@/services/preflight";

const BASE = "https://scvd.store";

describe("preflight's zero-spend evidence route", () => {
  it.each([PREFLIGHT_BATTERY, PREFLIGHT_BATTERY_NEXT])("keeps free signed history reachable beside a paid fresh probe (%s)", async (battery) => {
    const ladder = theRestOfTheLadder(battery, BASE);
    expect(ladder.free_signed_history).toMatchObject({
      history_url_template: `${BASE}/corpus/host/{host}.json`,
      issuer_key_url: `${BASE}/.well-known/scvd-signing-key`,
      requires_spend_authorization: false,
    });
    const history = ladder.free_signed_history as { history_url_template: string; issuer_key_url: string; guide_url: string };
    const response = await SELF.fetch(history.history_url_template.replace("{host}", "history-gap.example"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ rounds_probed: 0, cite_json: null });
    expect((await SELF.fetch(history.issuer_key_url)).status).toBe(200);
    expect((await SELF.fetch(history.guide_url)).status).toBe(200);
    const fresh = ladder.signed_copy_of_this_reading as { scope: string; requires_spend_authorization: boolean; signs_previous_preflight: boolean };
    expect(fresh.requires_spend_authorization).toBe(true);
    expect(fresh.signs_previous_preflight).toBe(false);
    expect(fresh.scope).toContain("free_signed_history");
    expect(fresh.scope).not.toContain("stop with the unsigned result");
  });
});
