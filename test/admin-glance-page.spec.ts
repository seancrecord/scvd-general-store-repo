import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { GLANCE_KEY, writeGlance } from "@/services/glance";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE PHONE VIEW. The keeper's ask was three words — fast, scannable,
 * works on a phone — and the existing desk fails all three for one
 * structural reason: seventeen loads before a number appears.
 *
 * This page is the answer to the first two-thirds while the desk's
 * own restructure is still ahead of it. It reads ONE key and renders
 * the five numbers he chose. Nothing else. It does not replace
 * /admin; it is the door he opens when he wants to know whether
 * anything needs him, from a phone, in one second.
 *
 * The tests that matter here are the honesty ones. A cached number
 * that presents as live would have him making calls on figures of
 * unknown age, so the page states when it was read; and an unwritten
 * blob renders as "not computed yet" rather than as five zeros,
 * because a zero says "I looked and there were none" and nothing has
 * looked.
 */

beforeEach(async () => {
  await testEnv.COUNTERS.delete(GLANCE_KEY);
});

async function page(): Promise<Response> {
  return SELF.fetch(`${BASE}/admin/glance`, {
    headers: { Accept: "text/html" },
  });
}

describe("the glance page", () => {
  it("is behind the same gate as the rest of the back room", async () => {
    /*
     * The desk's numbers are the store's private state. This page is
     * new surface, so the gate is asserted here rather than assumed
     * from the middleware's glob.
     */
    const response = await page();
    expect([401, 403, 302]).toContain(response.status);
  });

  it("says it has not been computed rather than showing zeros", async () => {
    const html = await (await SELF.fetch(`${BASE}/admin/glance`, {
      headers: { Accept: "text/html", ...adminAuth() },
    })).text();
    expect(html).toContain("not been computed");
    expect(html).not.toContain(">0<");
  });

  it("shows the five numbers and when they were read", async () => {
    const glance = await writeGlance(testEnv);
    const html = await (await SELF.fetch(`${BASE}/admin/glance`, {
      headers: { Accept: "text/html", ...adminAuth() },
    })).text();
    for (const label of [
      "Orders waiting",
      "Needs your review",
      "Open alarms",
      "Sales this month",
      "Take this month",
    ]) {
      expect(html, `the glance page is missing "${label}"`).toContain(label);
    }
    // The age is stated, never implied.
    expect(html).toContain(glance.computed_at.slice(0, 10));
  });
});

function adminAuth(): Record<string, string> {
  return {
    Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
  };
}
