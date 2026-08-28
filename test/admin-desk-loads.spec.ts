import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

const auth = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

/**
 * THE DESK STOPS WALKING THE BOOKS TO SAY HELLO.
 *
 * The keeper's ask was fast, scannable, works on a phone. /admin fired
 * seventeen parallel loads on every open, and the three most expensive
 * gated the FIRST section on the page: computeStats scans the metric
 * keys for every month the store has been open, takeSummary walks
 * every certificate, reconcileSettles walks the chain. Opening the
 * office to see whether anything needed him cost all of that.
 *
 * Worse, one of them earned a single sentence. reconcileSettles ran a
 * full chain walk so the page could print "they do" or "something to
 * chase" above a link to the page that shows the actual verdicts.
 *
 * So the money walks move to /admin/take, which is opened when the
 * question is money, and the hourly glance carries the books verdict
 * for the one-line summary. The desk keeps every light read it had.
 *
 * WHY A SOURCE-LEVEL GUARD. A timing assertion would be flaky and a
 * render assertion cannot see what the handler awaited before
 * rendering. What must not regress is the CALL — the day somebody adds
 * `computeStats` back into the desk's Promise.allSettled for one more
 * number, the page is slow again and nothing else would notice. Same
 * shape as the repo's bare-KV guards: read the source, name the rule.
 */

/*
 * Source read the way the repo's other source-level guards read it:
 * bundled at build time with ?raw, because the Workers test runtime
 * has no filesystem to open.
 */
const sources = import.meta.glob("/src/routes/admin.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function deskHandler(): string {
  const source = Object.values(sources)[0] ?? "";
  expect(source.length, "admin.ts did not load as source").toBeGreaterThan(0);
  const start = source.indexOf('adminRoutes.get("/admin", async (c) => {');
  expect(start, "the desk handler moved; this guard needs re-pointing").toBeGreaterThan(-1);
  // Up to the next top-level route registration.
  const next = source.indexOf("\nadminRoutes.", start + 10);
  return source.slice(start, next === -1 ? undefined : next);
}

/**
 * Comments stripped before the check, and a CALL is what is looked
 * for. The first draft of this guard failed on the paragraph in
 * admin.ts that explains which walks left and why — naming a function
 * in prose is not calling it, and a guard that cannot tell the
 * difference punishes the documentation that makes the rule
 * understandable.
 */
function withoutComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("what the desk does on open", () => {
  /*
   * AMENDED once the ruling was read properly. The first version of
   * this guard banned the walks outright, which took the all-time
   * take off the desk — undoing the 2026-08-05 consolidation, made
   * because the keeper twice read the month figure first and thought
   * the store had shrunk. The property that actually matters is
   * narrower and survives that ruling: the desk must never walk the
   * books ON EVERY OPEN. It reads the hourly blob, and fills that
   * blob once when it is cold (ensureGlance) rather than an hour of
   * missing headline after each deploy.
   */
  it("never starts a heavy walk", () => {
    const handler = withoutComments(deskHandler());
    for (const walk of [
      "computeStats",
      "takeSummary",
      "reconcileSettles",
      "refreshRailSplit",
    ]) {
      expect(
        handler.includes(`${walk}(`),
        `the desk calls ${walk} on open — that is the wait the keeper asked to be rid of`,
      ).toBe(false);
    }
  });

  it("still answers, and points at the money page", async () => {
    const html = await (
      await SELF.fetch(`${BASE}/admin`, { headers: auth })
    ).text();
    expect(html).toContain("/admin/take");
  });

  /**
   * THE FALSE ALARM THIS REFACTOR COULD HAVE SHIPPED. The books line
   * read `reconciliation && unexplained === 0 ? "they do" : "chase
   * it"`, so the moment reconciliation stopped being computed here it
   * would have rendered "something to chase" on a store whose books
   * were fine — an alarm invented by a performance change. Absent has
   * to read as absent.
   */
  it("never cries wolf about the books when nothing has checked them", async () => {
    const html = await (
      await SELF.fetch(`${BASE}/admin`, { headers: auth })
    ).text();
    if (html.includes("Something to chase")) {
      expect(
        html.includes("unexplained"),
        "the desk claims something to chase without a reconciliation behind it",
      ).toBe(true);
    }
  });
});

describe("the money page", () => {
  it("is gated like the rest of the back room", async () => {
    const response = await SELF.fetch(`${BASE}/admin/take`);
    expect([401, 403, 302]).toContain(response.status);
  });

  it("carries the take and the all-time split", async () => {
    const html = await (
      await SELF.fetch(`${BASE}/admin/take`, { headers: auth })
    ).text();
    expect(html).toContain("The take");
  });
});
