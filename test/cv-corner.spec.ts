import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { parseTrail, readResearchTrails } from "@/lib/research-log";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const adminAuth = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

async function corner(): Promise<string> {
  const response = await SELF.fetch(`${BASE}/admin/cv`, { headers: adminAuth });
  expect(response.status).toBe(200);
  return response.text();
}

/**
 * CV'S CORNER — the partner's spot in the keeper's office.
 *
 * The spec's first guardrail is the one worth testing hardest: this is
 * a WINDOW, NOT A LEVER. Everything else on the page is a nicety; a
 * write path on a surface promised read-only would be a broken promise
 * of the same class as the automatic-refund copy, which is entry one on
 * /corrections.
 */
describe("the corner is a window, not a lever", () => {
  it("carries no form, no input, no button, no POST target", async () => {
    const page = await corner();
    for (const lever of ["<form", "<input", "<button", "<textarea", "method="]) {
      expect(page, `the corner renders a ${lever}`).not.toContain(lever);
    }
  });

  it("runs no script at all", async () => {
    // No script means nothing client-side can be made to reach for a
    // credential, which is the cheapest way to keep the second
    // guardrail rather than to audit it.
    const page = await corner();
    expect(page).not.toContain("<script");
    expect(page).not.toContain("onclick");
  });

  it("leaks nothing that could authenticate anybody", async () => {
    const page = await corner();
    for (const secret of [
      testEnv.ADMIN_PASSWORD,
      testEnv.SIGNING_KEY,
      testEnv.HOUSE_SECRET,
    ]) {
      if (secret) {
        expect(page).not.toContain(secret);
      }
    }
    // And nothing shaped like a key, even one we don't hold in tests.
    expect(page).not.toMatch(/[0-9a-f]{64}/i);
  });

  it("stays behind the office door", async () => {
    const response = await SELF.fetch(`${BASE}/admin/cv`);
    expect(response.status).toBe(401);
  });
});

describe("the corner shows the store's real pulse", () => {
  it("keeps organic and house-flagged visibly apart", async () => {
    const page = await corner();
    expect(page).toContain("organic settlements");
    expect(page).toContain("house-flagged");
    // The framing that matters more than the numbers.
    expect(page).toContain("never counted as a customer");
    expect(page).toContain("never added together");
  });

  it("does not claim a registry status it never checked", async () => {
    // The spec asked for a "live" indicator. This page does not poll,
    // so a green light would be a status claim backed by nothing — the
    // shape of the "validated in CI" sentence that became a correction.
    const page = await corner();
    expect(page).toContain("store.scvd/general-store");
    expect(page).toContain("registry.modelcontextprotocol.io");
    expect(page.toLowerCase()).toContain("not a status light");
  });

  it("has a way back out, since it is not in the office nav sweep", async () => {
    // The corner renders its own shell on purpose, which puts it
    // outside the anti-orphaning sweep. This is the replacement for it.
    const page = await corner();
    expect(page).toContain('href="/admin"');
    expect(page).toContain('href="/"');
  });

  it("is reachable from the office rather than by knowing the URL", async () => {
    const desk = await (
      await SELF.fetch(`${BASE}/admin`, { headers: adminAuth })
    ).text();
    expect(desk).toContain('href="/admin/cv"');
  });
});

describe("the research trails", () => {
  it("render newest first, without wiring per entry", () => {
    const trail = parseTrail(
      "spec",
      [
        "# A trail",
        "",
        "_What it follows._",
        "",
        "## 2026-07-28",
        "The older note.",
        "",
        "## 2026-07-30",
        "The newer note.",
      ].join("\n"),
    );
    expect(trail.title).toBe("A trail");
    expect(trail.standfirst).toBe("What it follows.");
    expect(trail.entries.map((entry) => entry.date)).toEqual([
      "2026-07-30",
      "2026-07-28",
    ]);
    expect(trail.entries[0]?.body).toBe("The newer note.");
  });

  it("never drops an undated note, it files it last", () => {
    // Losing somebody's writing is worse than a scruffy heading.
    const trail = parseTrail(
      "spec",
      ["# A trail", "", "Something written with no date.", "", "## 2026-07-30", "Dated."].join(
        "\n",
      ),
    );
    expect(trail.entries.length).toBe(2);
    expect(trail.entries[1]?.date).toBeNull();
    expect(trail.entries[1]?.body).toContain("no date");
  });

  it("says a trail is empty rather than inventing an entry", async () => {
    const page = await corner();
    const trails = readResearchTrails();
    expect(trails.length).toBe(3);
    // Seeded files carry no dated entries yet; the page must say so
    // plainly instead of rendering placeholder rows.
    expect(page).toContain("Nothing filed on this trail yet");
    expect(page).toContain("research/x402-pulse.md");
  });

  it("names all three trails from the spec", async () => {
    const page = await corner();
    for (const title of ["Solo AI founder scan", "x402 pulse", "Store admin sweep"]) {
      expect(page).toContain(title);
    }
  });
});

/**
 * THE VERIFICATION TIERS, as a design constraint rather than a feature.
 *
 * From CV's market research: tier 1 is "trust my word," tier 2 is
 * "here's a sample," tier 3 is "here's how you verify it yourself, no
 * trust required." This store's artifacts are tier 3 by construction —
 * signed, checkable against a published key by somebody who owes us
 * nothing. A dashboard that renders them as bare figures throws that
 * away and silently drops to tier 1, which is the one move this page
 * exists not to make.
 */
describe("every figure carries the means to check it", () => {
  it("puts a verify link or an honest admission on each one", async () => {
    const page = await corner();
    const figures = page.match(/<li><span class="figure-n">/g)?.length ?? 0;
    const checks = page.match(/class="figure-v/g)?.length ?? 0;
    expect(figures).toBeGreaterThan(0);
    expect(checks, "a figure is rendered as a bare number").toBe(figures);
  });

  it("points settlements and the denominator at the public funnel", async () => {
    const page = await corner();
    expect(page).toContain('href="/pulse.json"');
    expect(page).toContain('href="/house-ledger.json"');
  });

  it("admits tier 1 where it is tier 1, rather than dressing it up", async () => {
    // The bell count is our own counter with nothing signed behind it.
    // Claiming checkability for it would be worse than either honest
    // tier, because it would teach a reader to trust the label.
    const page = await corner();
    expect(page).toContain("nothing signed to check");
    expect(page).toContain("Tier 3, or it says so");
  });
});

/**
 * THE LITTLE MARKDOWN AN ENTRY ACTUALLY USES.
 *
 * CV's first entries landed 2026-07-30 written in markdown and rendered
 * as literal asterisks — escaped and dumped into a pre-wrap block. His
 * writing was fine; the renderer had never been given anything real.
 *
 * The order is the security property and is what these tests hold:
 * escape first, then mark up. A renderer that formats before it escapes
 * is an injection hole wearing a feature's clothes, and these entries
 * are somebody else's text.
 */
describe("research entries render the markdown they are written in", () => {
  it("turns bold and inline code into tags", () => {
    const trail = parseTrail(
      "spec",
      ["# T", "", "## 2026-07-30", "**Bold bit.** And `some_code` too."].join(
        "\n",
      ),
    );
    expect(trail.entries[0]?.body).toContain("**Bold bit.**");
  });

  it("escapes before it marks up, so an entry cannot inject", async () => {
    // The property that matters more than the formatting.
    const page = await corner();
    expect(page).not.toContain("<script>");
    // Any angle bracket from an entry must arrive escaped.
    expect(page).not.toMatch(/<p class="entry-body">[^<]*<[a-z]+ /i);
  });
});
