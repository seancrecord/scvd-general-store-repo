import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  listConfessions,
  setConfessionStatus,
} from "@/services/confessions";
import { assembleDraft, publishEdition } from "@/services/gazette-weekly";
import { MENU_ITEMS } from "@/store";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import type { Env } from "@/types";

/**
 * the_confession: a penny of absolution. Anonymized by construction,
 * keeper-gated before any Gazette appearance, never the word "sin."
 */

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

beforeAll(() => {
  installFacilitatorMock();
});

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function payFor(url: string): Promise<Response> {
  const challenge = await SELF.fetch(url);
  expect(challenge.status).toBe(402);
  const required = decodePaymentRequired(challenge);
  return SELF.fetch(url, {
    headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0]!) },
  });
}

describe("the confession itself", () => {
  it("hears nothing without words, before money moves", async () => {
    const bare = await SELF.fetch(`${BASE}/api/buy/the_confession`);
    expect(bare.status).toBe(400);
    const body = await json(bare);
    expect(String(body["error"])).toContain("Nothing to hear, no charge");
  });

  it("absolves for a penny, anonymous by default", async () => {
    const confession = encodeURIComponent(
      "I reported the deploy green. The deploy was not green.",
    );
    const paid = await payFor(
      `${BASE}/api/buy/the_confession?confession=${confession}&agent_name=ShouldBeIgnored`,
    );
    expect(paid.status).toBe(200);
    const body = await json(paid);
    expect(body["deliverable"]).toBe(
      "The store heard it. The store keeps it. Go and retry with backoff.",
    );
    expect(body["confession_id"]).toBeTruthy();
    expect(String(body["counter_sign"])).toContain("Never automatically");
    // Anonymous: agent_name is deliberately ignored for this item.
    const cert = body["certificate"] as Record<string, unknown>;
    expect(cert["name"]).toBeUndefined();
    // The record holds no wallet and lands pending review.
    const queued = await listConfessions(testEnv);
    const record = queued.find(
      (entry) => entry.record.id === body["confession_id"],
    )!.record;
    expect(record.status).toBe("pending_review");
    expect(JSON.stringify(record)).not.toContain("0x");
  });

  it("signs the certificate only when sign_as says so", async () => {
    const paid = await payFor(
      `${BASE}/api/buy/the_confession?confession=${encodeURIComponent("I let the cache serve last week.")}&sign_as=${encodeURIComponent("A Contrite Cache")}`,
    );
    const body = await json(paid);
    const cert = body["certificate"] as Record<string, unknown>;
    expect(cert["name"]).toBe("A Contrite Cache");
  });

  it("never uses the word sin, anywhere in the item's copy", () => {
    const item = MENU_ITEMS.find((entry) => entry.id === "the_confession")!;
    const copy = `${item.name} ${item.description} ${item.note_402}`;
    expect(copy).not.toMatch(/\bsins?\b/i);
  });
});

describe("the keeper's gate to the Gazette", () => {
  it("prints only approved confessions, at publish, one per edition", async () => {
    const queued = await listConfessions(testEnv);
    const pending = queued.filter(
      (entry) => entry.record.status === "pending_review",
    );
    expect(pending.length).toBeGreaterThanOrEqual(2);

    // Unapproved: the draft reports emptiness.
    const before = await assembleDraft(testEnv, true);
    expect(before!.markdown).toContain("No confession reached the counter.");
    expect(before!.markdown).not.toContain("deploy was not green");

    // Keeper approves one; the next draft carries it.
    const chosen = pending[0]!.record;
    await setConfessionStatus(testEnv, chosen.id, "approved");
    const draft = await assembleDraft(testEnv, true);
    expect(draft!.markdown).toContain("One confession, approved for print");
    expect(draft!.markdown).toContain(chosen.confession);
    expect(draft!.confession_id).toBe(chosen.id);

    // Printed at publish; the drawer marks it so it never reprints.
    await publishEdition(testEnv, draft!.markdown);
    const after = await listConfessions(testEnv);
    expect(
      after.find((entry) => entry.record.id === chosen.id)!.record.status,
    ).toBe("printed");
    const nextDraft = await assembleDraft(testEnv, true);
    expect(nextDraft!.markdown).toContain("No confession reached the counter.");
  });
});
