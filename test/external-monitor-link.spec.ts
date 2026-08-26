import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { EXTERNAL_MONITOR_URL } from "@/services/pulse";

/**
 * ROADMAP 0.12, THE OTHER HALF — THE LINK, LIVE.
 *
 * The latency block has said since it shipped that "the external
 * monitor linked from this store is the one that owes you no
 * favours" — a promise of a link, published without the link. The
 * keeper stood the monitor up on 2026-08-26, the day two people
 * reported the site down and the store had no outside reading to
 * answer them with. This closes the sentence.
 *
 * WHAT THIS SPEC DOES NOT CLAIM: that the monitor is up, or that its
 * page still exists. CI cannot fetch an external host and should not
 * pretend to; asserting reachability here would be the guard that
 * argues for the lie the day UptimeRobot has an outage. It claims the
 * link is PUBLISHED, exactly where the prose promises one, and that
 * the prose and the link cannot drift apart.
 */
describe("the reading that owes us no favours is one click away", () => {
  it("serves the monitor link inside the latency block it narrates", async () => {
    const response = await SELF.fetch("https://scvd.store/pulse.json");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      latency: { external_monitor?: string; method?: string };
    };
    /*
     * The typeof comes first because both sides of the equality can be
     * undefined at once — the unbuilt version of this feature passed
     * the bare .toBe() on its first red run, absent field matching
     * absent export. Rule 52 wears many hats.
     */
    expect(typeof body.latency.external_monitor).toBe("string");
    expect(body.latency.external_monitor).toBe(EXTERNAL_MONITOR_URL);
    // The sentence that promises the link and the field that carries
    // it live in the same block, so neither can go quietly.
    expect(body.latency.method).toContain("external monitor");
  });

  it("pins the address itself, so a stale page cannot hide behind a green test", () => {
    expect(EXTERNAL_MONITOR_URL).toBe("https://stats.uptimerobot.com/VuHaG1k2c5");
    expect(EXTERNAL_MONITOR_URL.startsWith("https://")).toBe(true);
  });
});
