import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE RECORD GAUGE, WHERE THE MAILBOX LED USED TO HANG (2026-08-27,
 * the keeper's call).
 *
 * The mailbox gauge read "0 in · 0 answered" on the front of the
 * building for weeks — people chose other ways to reach the keeper,
 * and a counter publishing its own disuse was the one dead needle in
 * a row of live ones. What replaced it is the store's actual product:
 * the count of weekly corpus entries, read from the corpus's own key
 * names, a number that only ever goes up and grows without anybody
 * writing to it.
 *
 * THE DOOR STAYED. /api/letter has 38 references across the codebase
 * and several are load-bearing promises ("tell us what we got wrong
 * at /api/letter"). This change removed front-page score-keeping and
 * nothing else, and the last test here holds that line.
 */

async function frontPage(): Promise<string> {
  const response = await SELF.fetch("https://scvd.store/", {
    headers: { Accept: "text/html" },
  });
  expect(response.status).toBe(200);
  return response.text();
}

describe("the record gauge", () => {
  beforeAll(async () => {
    // Three Sundays on the record, keys only — the gauge never reads
    // values, so none are written.
    for (const sequence of [1, 2, 3]) {
      await testEnv.COUNTERS.put(
        `${KV_KEYS.corpusPrefix}${String(sequence).padStart(9, "0")}`,
        "{}",
      );
    }
  });

  it("counts the corpus's own keys, and says weeks", async () => {
    const html = await frontPage();
    expect(html).toContain("The record");
    expect(html).toContain('<em class="led-num">3</em> weeks');
    expect(html).toContain("signed, chained, anchored");
  });

  it("no longer hangs the mailbox LED on the front of the building", async () => {
    /*
     * The whole point of the change, asserted as an absence — and as
     * an absence derived from what would revive it: the exact strings
     * the old gauge rendered. If somebody restores it, this is where
     * that decision surfaces for review.
     */
    const html = await frontPage();
    expect(html).not.toContain("Mailbox:");
    expect(html).not.toMatch(/\d+<\/em> in .*answered/);
  });

  it("keeps the letters door and its promises untouched", async () => {
    /*
     * Removing the gauge must not have taken the mailbox with it: the
     * door still answers, and the trust surface still names it as the
     * way to reach a human. If either fails, the change overreached.
     */
    const post = await SELF.fetch("https://scvd.store/api/letter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "still open?" }),
    });
    expect(post.status).toBeLessThan(500);
    expect(post.status).not.toBe(404);

    const trust = await (
      await SELF.fetch("https://scvd.store/.well-known/trust.json")
    ).text();
    expect(trust).toContain("/api/letter");
  });
});
