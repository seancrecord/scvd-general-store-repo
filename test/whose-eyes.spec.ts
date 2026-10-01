import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { escapeHtml } from "@/lib/sanitize";
import { TRUST_MODELS, WHOSE_EYES } from "@/store/attestation-spec";
import { pendingPaymentStub } from "./helpers/payment";

const BASE = "https://scvd.store";
const testEnv = env as never as import("@/types").Env;

/**
 * WHOSE EYES (2026-10-01). Three kinds of signed record can describe
 * one purchase — the agent's own runtime receipt, this store's
 * certificate (a party to the sale), and a third-party observation —
 * and the market's word for all three is "receipt". The store says
 * which is which once, derived from its trust models, on /attestation
 * and on every receipt page. These pin that it is there, that it is
 * derived rather than retyped, and that it names seats and no vendor.
 */
describe("whose eyes, on /attestation", () => {
  it("rides the JSON, derived from the trust models, naming seats and no occupant", async () => {
    const body = (await (await SELF.fetch(`${BASE}/attestation`)).json()) as { whose_eyes: typeof WHOSE_EYES };
    expect(body.whose_eyes).toEqual(WHOSE_EYES);
    expect(body.whose_eyes.party).toContain(TRUST_MODELS.self_signed.means);
    expect(body.whose_eyes.observer).toContain(TRUST_MODELS.third_party_observation.means);
    expect(body.whose_eyes.none).toContain("None of the three proves");
    // Seats, not occupants (scorers.ts): the sentences describe kinds of
    // signature, never a product. A vendor name here is the defect.
    const text = Object.values(WHOSE_EYES).join(" ").toLowerCase();
    for (const vendor of ["treeship", "zerker", "sigstore", "rekor", "openai", "anthropic", "claude", "cursor", "codex"]) {
      expect(text, `whose-eyes copy names ${vendor}`).not.toContain(vendor);
    }
  });

  it("prints all three kinds on the human page, before the trust-model table", async () => {
    const page = await (
      await SELF.fetch(`${BASE}/attestation`, { headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" } })
    ).text();
    expect(page).toContain(escapeHtml(WHOSE_EYES.heading));
    expect(page).toContain(escapeHtml(WHOSE_EYES.runtime));
    expect(page).toContain(escapeHtml(WHOSE_EYES.party));
    expect(page).toContain(escapeHtml(WHOSE_EYES.observer));
    expect(page).toContain(escapeHtml(WHOSE_EYES.none));
    expect(page.indexOf(escapeHtml(WHOSE_EYES.runtime))).toBeLessThan(page.indexOf(escapeHtml(TRUST_MODELS.self_signed.weakness)));
  });
});

describe("whose eyes, on the receipt page", () => {
  it("carries the one-line version beside the signature verdict", async () => {
    const { fulfillPurchase } = await import("@/services/fulfillment");
    const item = {
      id: "hello", name: "A Signed Hello", price_usdc: 0.5, pricing: "fixed", fulfillment: "instant",
      description: "d", note_402: "n", listed_week: "2026-W30",
    } as never;
    const payment = pendingPaymentStub({ paidUsdc: 0.5 }) as unknown as Parameters<typeof fulfillPurchase>[2];
    const response = await fulfillPurchase(testEnv, item, payment, {});
    const page = await (
      await SELF.fetch(response["verify_url"] as string, { headers: { Accept: "text/html" } })
    ).text();
    expect(page).toContain("Signature verified just now");
    expect(page).toContain(escapeHtml(WHOSE_EYES.receipt_line));
    expect(page.indexOf(escapeHtml(WHOSE_EYES.receipt_line))).toBeLessThan(page.indexOf("Patron number"));
    // The JSON register of the same URL is a machine's; the line is for the person.
    const json = await (await SELF.fetch(response["verify_url"] as string, { headers: { Accept: "application/json" } })).text();
    expect(json).not.toContain(WHOSE_EYES.receipt_line);
  });
});
