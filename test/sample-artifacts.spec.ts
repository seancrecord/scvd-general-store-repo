import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { performServiceAudit } from "@/services/service-audit";
import {
  SAMPLE_AUDIT_ID,
  SAMPLE_SUBJECT_URL,
  sampleOnceOver,
} from "@/services/sample-artifacts";
import { getMenuItem } from "@/store/menu";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

const BROWSER = {
  Accept: "text/html,application/xhtml+xml",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
};

/**
 * THE FREE SAMPLE (#31), AND THE ONE THING IT MUST NEVER BE.
 *
 * The obvious way to build a sample of a signed artifact is to run
 * the real builder over a canned response. `performServiceAudit`
 * SIGNS — unconditionally, with the store's live key — so that design
 * would have published, free and at a stable URL, a genuine ed25519
 * signature from this store over a probe that never happened. It
 * would verify. Anybody could hand it to anybody.
 *
 * The sample is therefore built from the machinery below the
 * signature, and these are the guards that keep it there.
 */
describe("a specimen can never be mistaken for evidence", () => {
  it("carries no signature and no key, anywhere in the body", async () => {
    const response = await SELF.fetch(`${BASE}/samples/once-over.json`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;

    const found: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) {
        node.forEach((item, index) => walk(item, `${path}[${index}]`));
        return;
      }
      if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          if (["signature", "public_key", "signature_covers"].includes(key)) {
            found.push(`${path}.${key}`);
          }
          walk(value, `${path}.${key}`);
        }
      }
    };
    walk(body, "$");
    expect(
      found,
      "the free sample carries signature material. A signed artifact from this store, published free at a stable URL, over a probe that never happened, is the worst thing an evidence observatory could put on the internet — and it would verify.",
    ).toEqual([]);
  });

  it("says out loud that it does not verify, and why that is the difference", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/samples/once-over.json`)
    ).json()) as Record<string, string>;
    expect(body["not_signed"]).toContain("NOT verify");
    expect(body["not_signed"]).toContain("/api/verify/");
    expect(body["mark"]).toBe("SPECIMEN");
    expect(body["specimen"]).toBe(true);
  });

  /**
   * The subject must be unresolvable BY CONSTRUCTION, not by our
   * having picked a hostname nobody happens to own today. RFC 2606
   * reserves .example forever.
   */
  it("names a subject that can never be a real operator", async () => {
    expect(SAMPLE_SUBJECT_URL).toMatch(/\.example\//);
    const body = (await (
      await SELF.fetch(`${BASE}/samples/once-over.json`)
    ).json()) as Record<string, string>;
    expect(body["not_about_anyone"]).toContain("RFC 2606");
  });

  /**
   * The id is published, so somebody will try it. Whatever /api/verify
   * says about it, it must not be "here is a valid artifact".
   */
  it("resolves to nothing at the verify door", async () => {
    const response = await SELF.fetch(`${BASE}/api/verify/${SAMPLE_AUDIT_ID}`);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

/**
 * THE DIFFERENTIAL. A sample is worth nothing if it shows a shape the
 * buyer will not receive, and prose promising "every field a buyer
 * gets" rots the first time the paid artifact grows one. So this runs
 * the REAL paid builder against the same kind of canned door and
 * compares field sets — the sample must carry every field the paid
 * observation carries, minus exactly the signature material it is
 * forbidden to have.
 */
describe("the sample shows what the purchase actually hands back", () => {
  async function realAudit(): Promise<Record<string, unknown>> {
    const canned = (async () =>
      new Response(
        JSON.stringify({
          x402Version: 1,
          accepts: [
            {
              scheme: "exact",
              network: "base",
              maxAmountRequired: "10000",
              resource: "https://another.example/x",
              description: "thing",
              mimeType: "application/json",
              payTo: "0x0000000000000000000000000000000000000000",
              maxTimeoutSeconds: 60,
              asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            },
          ],
        }),
        { status: 402, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;
    return (await performServiceAudit(testEnv, "https://another.example/x", {
      fetch: canned,
    })) as unknown as Record<string, unknown>;
  }

  it("carries every field the paid artifact carries, minus the signature", async () => {
    const paid = await realAudit();
    const sample = await sampleOnceOver(testEnv, 5);
    const forbidden = new Set(["signature", "public_key", "signature_covers"]);
    // evidence_hash is deliberately absent: it is the digest of a real
    // observation, and computing one over constructed facts would give
    // the specimen a number that looks checkable and is not.
    const notPromised = new Set(["evidence_hash"]);
    const missing = Object.keys(paid).filter(
      (key) =>
        !forbidden.has(key) &&
        !notPromised.has(key) &&
        !(key in (sample.sample as Record<string, unknown>)),
    );
    expect(
      missing,
      "the paid Once-Over grew a field the sample does not show. The sample says it shows every field a buyer gets; that sentence is now false. Add the field here, or narrow the sentence.",
    ).toEqual([]);
  });

  /**
   * THE SAMPLE'S WHOLE POINT, AND IT CHANGED ONCE ALREADY.
   *
   * The first constructed door had no PAYMENT-REQUIRED header, the
   * battery short-circuited, and the sample was two rows long — a
   * demonstration of the instrument's exit path rather than its work.
   * The fix moved the defect deeper, and landed somewhere better than
   * intended: the door now passes v1's frozen core and fails v2's
   * atomic-amount check, so the specimen shows ONE probe reaching TWO
   * verdicts that disagree.
   *
   * That disagreement is the single most valuable and least
   * explicable thing the $5 buys, and no prose description of this
   * product has ever managed to show it. If the two batteries ever
   * agree on this door, the sample has quietly stopped demonstrating
   * the thing it exists to demonstrate.
   */
  it("shows one probe reaching two verdicts that disagree", async () => {
    const sample = await sampleOnceOver(testEnv, 5);
    expect(sample.sample.checks.length).toBeGreaterThan(3);
    expect(sample.sample.verdict).toBe("ready");
    expect(sample.sample.also_under?.verdict).toBe("not_ready");
    expect(
      sample.sample.also_under?.verdict,
      "the constructed door no longer splits the two batteries, so the sample demonstrates nothing a prose description could not",
    ).not.toBe(sample.sample.verdict);
    expect(sample.sample.also_under?.difference).toContain("DISAGREED");
    // The named finding, in the published vocabulary, not in prose.
    expect(
      sample.sample.advisories.map((advisory) => advisory.name),
    ).toContain("amount-not-atomic");
  });

  /**
   * AND THE HONEST FOOTNOTE ON THAT SECOND VERDICT: a real purchase
   * folds the Solana rail read into v2, and building a specimen dials
   * nothing. Claiming the same coverage would be the sample
   * overselling the product, which is a stranger failure than the
   * usual direction and just as wrong.
   */
  it("does not claim a network read it never made", async () => {
    const sample = await sampleOnceOver(testEnv, 5);
    expect(sample.sample.also_under?.difference).toContain(
      "no network call was made to build this specimen",
    );
  });

  it("quotes the shelf's own price rather than a second copy of it", async () => {
    const item = getMenuItem("service_audit")!;
    const sample = await sampleOnceOver(testEnv, item.price_usdc);
    expect(sample.price_of_the_real_thing).toBe(`$${item.price_usdc}`);
    expect(sample.buy_url).toContain("/api/buy/service_audit");
  });

  /** Frozen, so the bytes are stable and no reader thinks we probed for them. */
  it("does not move when it is read twice", async () => {
    const first = await (await SELF.fetch(`${BASE}/samples/once-over.json`)).text();
    const second = await (await SELF.fetch(`${BASE}/samples/once-over.json`)).text();
    expect(first).toBe(second);
  });
});

describe("the room a buyer walks into", () => {
  it("is free, and says the free check comes before the paid one", async () => {
    const response = await SELF.fetch(`${BASE}/samples`, { headers: BROWSER });
    expect(response.status).toBe(200);
    const html = await response.text();
    // Rule 58.3/58.4: the free path is named before the paid one.
    const freeAt = html.indexOf("check your own door for nothing");
    const buyAt = html.indexOf("/api/buy/service_audit");
    expect(freeAt).toBeGreaterThan(-1);
    expect(buyAt).toBeGreaterThan(-1);
    // And the line that costs us money, said anyway.
    expect(html).toContain("you owe us nothing");
  });

  it("hands an agent the JSON at the same URL", async () => {
    const response = await SELF.fetch(`${BASE}/samples`);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["free"]).toContain("Yes");
  });

  it("walks every link it promises", async () => {
    const html = await (await SELF.fetch(`${BASE}/samples`, { headers: BROWSER })).text();
    const hrefs = [...html.matchAll(/href="(\/[^"#]*)"/g)].map((match) => match[1]!);
    const dead: string[] = [];
    for (const href of [...new Set(hrefs)].filter((h) => !h.includes("{"))) {
      const response = await SELF.fetch(`${BASE}${href}`);
      if (response.status >= 400 && response.status !== 402) {
        dead.push(`${href} -> ${response.status}`);
      }
    }
    expect(dead).toEqual([]);
  });

  it("puts the sample where the shelf itself will carry it", async () => {
    const body = (await (await SELF.fetch(`${BASE}/menu.json`)).json()) as {
      items: { id: string; sample_url?: string }[];
    };
    const audit = body.items.find((item) => item.id === "service_audit");
    expect(
      audit?.sample_url,
      "the sample exists but the shelf does not point at it, which is the machinery-nobody-can-find failure",
    ).toContain("/samples/once-over.json");
  });
});
