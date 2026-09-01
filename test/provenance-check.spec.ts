import { SELF, env } from "cloudflare:test";
import { privateKeyToAccount } from "viem/accounts";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { payToDigest } from "@/lib/pay-to-digest";
import { takeCorpusSnapshot } from "@/services/corpus";
import {
  currentSelfAuditWeek,
  readSelfAudits,
  selfAuditChallengeText,
} from "@/services/provenance-check";
import { getMenuItem } from "@/store/menu";
import type { WardRound } from "@/services/ward-round";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

const WALLET_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const SIGNER = privateKeyToAccount(WALLET_KEY);
const WALLET = SIGNER.address.toLowerCase();
const OTHER = "0x2222222222222222222222222222222222222222";
const NEVER = "0x3333333333333333333333333333333333333333";

const okCalendar = {
  calendars: ["https://calendar.test"],
  fetch: (async () => new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
};

function hostRow(host: string, verdict: string, payTo?: string[], terms: Record<string, unknown> = {}) {
  return {
    host,
    url: `https://${host}/x402`,
    verdict,
    failed: [],
    advisories: [],
    ...(payTo
      ? { offer: { networks: ["eip155:8453"], schemes: ["exact"], min_usdc: 0.01, pay_to: payTo, ...terms } }
      : {}),
  };
}

async function seedWeek(week: string, hosts: Record<string, unknown>[]): Promise<void> {
  await testEnv.COUNTERS.put(
    KV_KEYS.wardRoundLatest,
    JSON.stringify({ week, at: "2026-08-20T00:00:00.000Z", listed_resources: hosts.length, coverage_suspect: false, hosts } as unknown as WardRound),
  );
  const pass = await takeCorpusSnapshot(testEnv, okCalendar);
  expect(pass.taken).toBe(true);
}

async function clearAll(): Promise<void> {
  for (const ns of [testEnv.ORDERS, testEnv.COUNTERS]) {
    let cursor: string | undefined;
    do {
      const page = await ns.list({ cursor });
      for (const key of page.keys) await ns.delete(key.name);
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  }
}

async function seedTwoWeeks(): Promise<void> {
  await seedWeek("2026-W33", [
    hostRow("alpha.example", "ready", [WALLET]),
    hostRow("beta.example", "ready", [WALLET, OTHER]),
    hostRow("gamma.example", "not_ready", [OTHER]),
  ]);
  await seedWeek("2026-W34", [
    // alpha's terms moved; beta dropped the wallet; delta picked it up.
    hostRow("alpha.example", "ready", [WALLET], { min_usdc: 0.05 }),
    hostRow("beta.example", "ready", [OTHER]),
    hostRow("delta.example", "not_ready", [WALLET]),
  ]);
}

beforeAll(() => {
  installFacilitatorMock();
});

/**
 * ROADMAP N4 — THE COMPANY AN ADDRESS KEEPS (the G2 ruling's tier-3
 * lane; the keeper's price 2026-08-29 and copy 2026-09-01). The named
 * join the free tiers withhold, inside a signed artifact delivered to
 * the buyer, never published, never a score; free for an operator
 * asking about their own address once proved, ending with the consent
 * offer. These tests hold the rules the ruling carries.
 */
describe("the item on the shelf", () => {
  it("is five dollars, reads the books, address required, and says what it is not", () => {
    const item = getMenuItem("provenance_check")!;
    expect(item.name).toBe("The Company an Address Keeps");
    expect(item.price_usdc).toBe(5);
    expect(item.reads).toBe("our_books");
    expect(item.cadence).toBe("one_off");
    expect(item.description).toContain("does not grade operators");
    expect(item.description).toContain("free once you prove it is yours");
    expect(item.note_402).toContain("Nothing for your own");
  });

  it("refuses a missing or malformed address before money, naming the free door", async () => {
    const buying = { headers: { "PAYMENT-SIGNATURE": "x" } };
    const missing = await SELF.fetch(`${BASE}/api/buy/provenance_check`, buying);
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { error: string }).error).toContain("/api/provenance/self");
    const bad = await SELF.fetch(`${BASE}/api/buy/provenance_check?address=not-an-address`, buying);
    expect(bad.status).toBe(400);
  });
});

describe("the named join, derived from the signed chain", () => {
  beforeEach(clearAll);

  async function buy(address: string): Promise<Record<string, any>> {
    const url = `${BASE}/api/buy/provenance_check?address=${address}`;
    const challenge = await SELF.fetch(url);
    expect(challenge.status).toBe(402);
    const accepted = decodePaymentRequired(challenge).accepts[0]!;
    const paid = await SELF.fetch(url, { headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) } });
    expect(paid.status).toBe(200);
    return (await paid.json()) as Record<string, any>;
  }

  it("names the doors per signed week, the drift between them, and the digest behind every line", async () => {
    await seedTwoWeeks();
    const body = await buy(WALLET);
    const record = body.provenance_check;
    expect(record.artifact).toBe("provenance_check");
    expect(record.subject).toEqual({ kind: "address", address: WALLET, digest: await payToDigest(WALLET) });
    expect(record.never_seen).toBe(false);
    expect(record.weeks.map((w: { week: string }) => w.week)).toEqual(["2026-W33", "2026-W34"]);
    expect(record.weeks[0].doors.map((d: { host: string }) => d.host)).toEqual(["alpha.example", "beta.example"]);
    expect(record.weeks[1].doors.map((d: { host: string }) => d.host)).toEqual(["alpha.example", "delta.example"]);
    expect(record.weeks[1].doors[1].verdict).toBe("not_ready");
    for (const week of record.weeks) {
      expect(week.sequence).toBeGreaterThan(0);
      expect(week.digest).toMatch(/^[0-9a-f]{64}$/);
    }
    const changes = record.drift.map((d: { change: string; host: string }) => `${d.change}:${d.host}`).sort();
    expect(changes).toEqual([
      "door_appeared:delta.example",
      "door_disappeared:beta.example",
      "terms_changed:alpha.example",
    ]);
    // The rules the ruling carries, on the artifact.
    expect(record.shared_wallet_caveat).toContain("not a verdict about operators");
    expect(record.honest_limits.length).toBeGreaterThan(2);
    expect(record.what_this_is_not).toContain("never published");
    expect(JSON.stringify(record)).not.toMatch(/"operator"\s*:/);
    // No score anywhere — as a field. (The words "not a risk score" are the artifact refusing one.)
    expect(JSON.stringify(record)).not.toMatch(/"score"\s*:/);
    // OTHER's doors are not the subject's business: gamma never appears.
    expect(JSON.stringify(record)).not.toContain("gamma.example");
    // Signed, bound, served to the holder.
    expect(body.evidence_hash).toMatch(/^[0-9a-f]{64}$/);
    const verify = (await (await SELF.fetch(`${BASE}/api/verify/${body.certificate.cert_id}`)).json()) as Record<string, any>;
    expect(verify.valid).toBe(true);
    expect(verify.certificate.attests).toBe(body.evidence_hash);
    expect(body.record_url).toBe(`/api/provenance-check/${record.provenance_id}`);
    const served = (await (await SELF.fetch(`${BASE}${body.record_url}`)).json()) as Record<string, any>;
    expect(served.check.provenance_id).toBe(record.provenance_id);
    expect(served.certificate).toBe(`${BASE}/api/verify/${body.certificate.cert_id}`);
    expect(String(served.what_this_is)).toContain("published nowhere");
  });

  it("an address the chain has never seen is answered as exactly that, and still sold", async () => {
    await seedTwoWeeks();
    const body = await buy(NEVER);
    expect(body.provenance_check.never_seen).toBe(true);
    expect(body.provenance_check.weeks).toEqual([]);
    expect(String(body.deliverable ?? body.message ?? JSON.stringify(body))).toContain("never seen");
  });

  it("the subject's standing note rides verbatim when one exists", async () => {
    await seedTwoWeeks();
    const digest = await payToDigest(WALLET);
    await testEnv.COUNTERS.put(
      KV_KEYS.standingNote(`wallet:${digest}`),
      JSON.stringify({
        subject: `wallet:${digest}`,
        statement: "Both doors are ours; the address is our treasury.",
        attached_at: "2026-08-28T00:00:00.000Z",
        evidence: "wallet_signature",
        what_this_is: "A statement by the party who proved control of this subject. It stands beside this store's observation and never alters it.",
      }),
    );
    const body = await buy(WALLET);
    expect(body.provenance_check.standing_note.statement).toBe("Both doors are ours; the address is our treasury.");
  });

  it("an unknown record id is a 404 naming the item", async () => {
    const response = await SELF.fetch(`${BASE}/api/provenance-check/prov_nope`);
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: string }).error).toContain("/api/buy/provenance_check");
  });
});

describe("the free self-audit: proved-own, counted as an ask, ending with the offer", () => {
  beforeEach(clearAll);

  it("GET shows this week's challenge for an address", async () => {
    const body = (await (await SELF.fetch(`${BASE}/api/provenance/self?address=${WALLET}`)).json()) as Record<string, any>;
    expect(body.week).toBe(currentSelfAuditWeek());
    expect(body.challenge).toBe(selfAuditChallengeText(WALLET, body.week));
    expect(String(body.what_we_keep)).toContain("No address");
  });

  it("a wrong signature is refused and counts as nothing", async () => {
    const week = currentSelfAuditWeek();
    const stranger = privateKeyToAccount("0x4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb");
    const signature = await stranger.signMessage({ message: selfAuditChallengeText(WALLET, week) });
    const response = await SELF.fetch(`${BASE}/api/provenance/self`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: WALLET, signature }),
    });
    expect(response.status).toBe(403);
    expect(await readSelfAudits(testEnv, week)).toBe(0);
  });

  it("a proved address gets the same answer free, the offer at the end, and one tick on the week", async () => {
    await seedTwoWeeks();
    const week = currentSelfAuditWeek();
    const signature = await SIGNER.signMessage({ message: selfAuditChallengeText(WALLET, week) });
    const response = await SELF.fetch(`${BASE}/api/provenance/self`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: WALLET, signature }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, any>;
    expect(body.free).toBe(true);
    expect(body.proved).toEqual({ by: "wallet_signature", week });
    expect(body.weeks.map((w: { week: string }) => w.week)).toEqual(["2026-W33", "2026-W34"]);
    expect(body.drift.length).toBe(3);
    // The offer: what a note is, that it is public, a yes required, declining costs nothing.
    expect(body.consent_offer.it_is_public).toBe(true);
    expect(body.consent_offer.a_yes_is_required).toBe(true);
    expect(String(body.consent_offer.declining_costs)).toContain("Nothing");
    expect(String(body.consent_offer.how_to_say_yes)).toContain("/api/standing-note");
    // Count the ask, not the asker.
    expect(body.self_audits_this_week).toBe(1);
    expect(await readSelfAudits(testEnv, week)).toBe(1);
    const keys = await testEnv.COUNTERS.list({ prefix: "prov_self:" });
    expect(keys.keys.map((k) => k.name)).toEqual([`prov_self:${week}`]);
    expect(JSON.stringify(body)).not.toMatch(/"operator"\s*:/);
  });
});
