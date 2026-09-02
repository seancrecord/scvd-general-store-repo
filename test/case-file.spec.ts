import { SELF, env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  BASE_USDC,
  TRANSFER_TOPIC,
  type RpcReceipt,
} from "@/lib/base-rpc";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  FORBIDDEN_VERDICT_WORDS,
  chainOfHash,
  performCaseFile,
  watchRowsForHost,
} from "@/services/case-file";
import { mintCertificate } from "@/services/certificates";
import { takeCorpusSnapshot } from "@/services/corpus";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import { MENU_ITEMS, getMenuItem } from "@/store";
import { artifactClassForItem } from "@/store/attestation-spec";
import { CAPABILITY_QUERY, SPEC_RETURNS, SPEC_WHY_USE } from "@/store/spec";
import type { Env } from "@/types";
import { isRecord } from "@/types";
import clawhubBundle from "../registry/clawhub/SKILL.md?raw";
import {
  installFacilitatorMock,
  type FacilitatorMockState,
} from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

/**
 * THE CASE FILE (roadmap N8, 2026-09-02) — written red first from the
 * keeper's prompt: every section present on a full fixture; every
 * absent section enumerated in gaps on an empty one; the conflict line
 * iff this store is a party; no forbidden word and no verdict on the
 * artifact; declared fields never influence an observed field; the
 * price the same in every copy map; the same tx and mandate inside a
 * day is the same case; and /case/{id} serves forever.
 */

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const PAYER = "0x1111111111111111111111111111111111111111";
const STRANGER = "0x2222222222222222222222222222222222222222";
const TX = `0x${"ab".repeat(32)}`;

let facilitator: FacilitatorMockState;

function topicFor(address: string): string {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function units(usdc: number): string {
  return `0x${BigInt(Math.round(usdc * 1_000_000)).toString(16).padStart(64, "0")}`;
}

function transferReceipt(to: string, usdc: number): RpcReceipt {
  return {
    status: "0x1",
    blockNumber: "0x64",
    logs: [
      {
        address: BASE_USDC,
        topics: [TRANSFER_TOPIC, topicFor(PAYER), topicFor(to)],
        data: units(usdc),
      },
    ],
  };
}

/**
 * The chain, answered: JSON-RPC bodies get the receipt and the head;
 * everything else falls through to the facilitator mock, which is the
 * fetch already installed. Restored after each test.
 */
let restoreFetch: (() => void) | null = null;
function withChain(receipt: RpcReceipt | null): void {
  const underneath = globalThis.fetch;
  const rpc = (result: unknown) =>
    new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
      headers: { "content-type": "application/json" },
    });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof init?.body === "string" ? init.body : "";
    if (raw.includes('"method":"eth_')) {
      const body = JSON.parse(raw) as { method: string };
      if (body.method === "eth_blockNumber") return rpc("0x80");
      if (body.method === "eth_getBlockByNumber") return rpc({ timestamp: "0x68b5c000" });
      if (body.method === "eth_getTransactionReceipt") return rpc(receipt);
      return rpc(null);
    }
    return underneath(input, init);
  }) as typeof fetch;
  restoreFetch = () => {
    globalThis.fetch = underneath;
  };
}

function host(name: string, verdict: WardHostResult["verdict"]): WardHostResult {
  return { host: name, url: `https://${name}/x402`, verdict, failed: [], advisories: [], source: "discovery" };
}

function round(week: string, hosts: WardHostResult[]): WardRound {
  return {
    week,
    at: "2026-09-01T00:00:00.000Z",
    listed_resources: hosts.length,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts,
  };
}

const okCalendar = {
  calendars: ["https://calendar.test"],
  fetch: (async () => new Response(new Uint8Array([1, 2, 3]))) as unknown as typeof fetch,
};

/** The block time the stub answers (0x68b5c000), as a Date. */
const MINED = new Date(0x68b5c000 * 1000);

async function seedDoor(name: string): Promise<void> {
  // Two rounds a day apart around the mined time, so the door window holds them.
  const days = [-2, -1, 1];
  for (const [index, offset] of days.entries()) {
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(round(`2026-W3${index + 1}`, [host(name, "ready")])),
    );
    const pass = await takeCorpusSnapshot(testEnv, {
      ...okCalendar,
      now: new Date(MINED.getTime() + offset * 86_400_000),
    });
    if (!pass.taken) throw new Error(`seed failed: ${pass.reason}`);
  }
}

async function seedWatch(name: string): Promise<void> {
  await testEnv.ORDERS.put(
    KV_KEYS.standingWatch("watch_casefile01"),
    JSON.stringify({
      watch_id: "watch_casefile01",
      url: `https://${name}/x402`,
      started_at: new Date(MINED.getTime() - 3 * 86_400_000).toISOString(),
      ends_at: new Date(MINED.getTime() + 4 * 86_400_000).toISOString(),
      probes: [
        { at: new Date(MINED.getTime() - 3600_000).toISOString(), verdict: "ready", failed: [], signature: "", public_key: "" },
        { at: new Date(MINED.getTime() + 30 * 86_400_000).toISOString(), verdict: "ready", failed: [], signature: "", public_key: "" },
      ],
    }),
  );
}

async function seedMandate(id: string, cap: number): Promise<void> {
  await testEnv.PATRONS.put(
    KV_KEYS.mandate(id),
    JSON.stringify({
      mandate: {
        mandate_id: id,
        recorded_at: "2026-08-30T00:00:00.000Z",
        submitted_as: "agent",
        mandate_text: "buy one report under a dollar",
        declared_cap_usdc: cap,
        evidence_hash: "00",
        scope: "test",
        signature: "",
        public_key: "",
        signature_covers: "",
      },
      cert_id: "cert_test",
      created_at: "2026-08-30T00:00:00.000Z",
    }),
  );
}

async function json(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (!isRecord(body)) throw new Error("Expected a JSON object body");
  return body;
}

async function buy(url: string): Promise<Record<string, unknown>> {
  const challenge = await SELF.fetch(url);
  expect(challenge.status).toBe(402);
  const accepted = decodePaymentRequired(challenge).accepts[0];
  if (!accepted) throw new Error(`No payment option offered for ${url}`);
  const paid = await SELF.fetch(url, { headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) } });
  const body = await paid.text();
  expect(paid.status, body).toBe(200);
  return JSON.parse(body) as Record<string, unknown>;
}

beforeAll(() => {
  facilitator = installFacilitatorMock();
});

beforeEach(async () => {
  const listed = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
  await Promise.all(listed.keys.map((key) => testEnv.COUNTERS.delete(key.name)));
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
  await testEnv.COUNTERS.delete(KV_KEYS.populationRegister);
  await testEnv.ORDERS.delete(KV_KEYS.standingWatch("watch_casefile01"));
});

afterEach(() => {
  restoreFetch?.();
  restoreFetch = null;
});

describe("the sections, present and absent by name", () => {
  it("every section is present on a full fixture, and the tier at the time rides the door", async () => {
    withChain(transferReceipt(STRANGER, 0.5));
    await seedDoor("door.example");
    await seedWatch("door.example");
    await seedMandate("m_full", 1);
    const file = await performCaseFile(testEnv, {
      txHash: TX,
      mandateId: "m_full",
      endpointUrl: "https://door.example/x402",
      launchCheckId: "lc_missing",
      claim: "the tool returned an empty body",
    }, MINED);
    expect(file.settlement.presence.present).toBe(true);
    expect(file.reconciliation.presence.present).toBe(true);
    expect(file.mandate.presence.present).toBe(true);
    expect(file.mandate.declared_cap_usdc).toBe(1);
    expect(file.mandate.settled_usdc).toBe(0.5);
    expect(file.mandate.settled_within_declared_cap).toBe(true);
    expect(file.door.presence.present).toBe(true);
    expect(file.door.rounds?.length).toBe(3);
    expect(file.door.watch_rows?.length).toBe(1);
    expect(file.door.tier_at_the_time?.line).toMatch(/\b\d+ of \d+\b/);
    // Delivery: a launch check id that resolves to nothing is a gap by name.
    expect(file.delivery.presence.present).toBe(false);
    expect(file.gaps.map((gap) => gap.section)).toEqual(["delivery"]);
    expect(file.conflict).toBeUndefined();
    expect(file.declared.claim).toBe("the tool returned an empty body");
  });

  it("every optional section is absent on an empty fixture, each with its reason in gaps", async () => {
    withChain(transferReceipt(STRANGER, 0.5));
    const file = await performCaseFile(testEnv, { txHash: TX }, MINED);
    expect(file.settlement.presence.present).toBe(true);
    expect(file.reconciliation.presence.present).toBe(true);
    for (const section of ["mandate", "door", "delivery"] as const) {
      expect(file[section].presence.present).toBe(false);
    }
    expect(file.gaps.map((gap) => gap.section)).toEqual(["mandate", "door", "delivery"]);
    for (const gap of file.gaps) expect(gap.reason.length).toBeGreaterThan(20);
    expect(file.gaps.find((gap) => gap.section === "delivery")?.reason).toContain("delivery not observed by this store");
  });

  it("a Solana signature gets the reconciliation as absent with the reason, by the hash's shape", () => {
    expect(chainOfHash(TX)).toBe("evm");
    expect(chainOfHash("5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uziwBnmU5ZpRvoXMQEzoRoBxV2Dm4qDx5B5Cy9k")).toBe("solana");
  });

  it("a host this store never observed is not_observed — an answer about our books", async () => {
    withChain(transferReceipt(STRANGER, 0.5));
    const file = await performCaseFile(testEnv, { txHash: TX, endpointUrl: "https://never.example/x402" }, MINED);
    expect(file.door.presence.present).toBe(false);
    expect((file.door.presence as { reason: string }).reason).toContain("not_observed");
    expect(file.door.history_url).toBe(`${BASE}/corpus/host/never.example.json`);
  });

  it("watch rows by host and window is the lookup that did not exist: rows inside the window only", async () => {
    await seedWatch("door.example");
    const from = new Date(MINED.getTime() - 86_400_000).toISOString();
    const to = new Date(MINED.getTime() + 86_400_000).toISOString();
    const { rows, truncated } = await watchRowsForHost(testEnv, "door.example", from, to, BASE);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("standing_watch");
    expect(rows[0]?.history_url).toBe(`${BASE}/api/watch/watch_casefile01`);
    expect(truncated).toBe(false);
  });
});

describe("the conflict line", () => {
  it("appears iff this store is a party: our till as recipient, or our own door", async () => {
    withChain(transferReceipt(testEnv.PAY_TO_ADDRESS, 0.5));
    const ours = await performCaseFile(testEnv, { txHash: TX }, MINED);
    expect(ours.conflict?.this_store_is_a_party).toBe(true);
    expect(ours.conflict?.because).toContain("this store is a party to this purchase");
    expect(ours.conflict?.rights_url).toBe(`${BASE}/rights`);
    expect(ours.conflict?.fulfillment_log_url).toBe(`${BASE}/fulfillment-log`);
    restoreFetch?.();

    withChain(transferReceipt(STRANGER, 0.5));
    const theirs = await performCaseFile(testEnv, { txHash: TX }, MINED);
    expect(theirs.conflict).toBeUndefined();
    restoreFetch?.();

    withChain(transferReceipt(STRANGER, 0.5));
    const ourDoor = await performCaseFile(testEnv, { txHash: TX, endpointUrl: `${BASE}/api/buy/hello` }, MINED);
    expect(ourDoor.conflict?.because).toContain("this store's own host");
  });

  it("our own certificate against the settlement is the delivery section, and names us a party", async () => {
    withChain(transferReceipt(STRANGER, 0.5));
    const minted = await mintCertificate(testEnv, { itemId: "hello", settlementTx: TX });
    const file = await performCaseFile(testEnv, { txHash: TX }, MINED);
    expect(file.delivery.presence.present).toBe(true);
    expect(file.delivery.our_certificate?.cert_id).toBe(minted.certificate.cert_id);
    expect(file.conflict?.because).toContain("the seller");
    await testEnv.PATRONS.delete(KV_KEYS.settlementCert(TX.toLowerCase()));
  });
});

describe("no verdict, ever", () => {
  it("no field carries a forbidden word or a verdict of the file's own", async () => {
    withChain(transferReceipt(STRANGER, 0.5));
    const file = await performCaseFile(testEnv, { txHash: TX, claim: "they took the money" }, MINED);
    const flat = JSON.stringify(file).toLowerCase();
    for (const word of FORBIDDEN_VERDICT_WORDS) {
      expect(flat, `the artifact says "${word}"`).not.toContain(word);
    }
    expect(Object.keys(file)).not.toContain("verdict");
    expect(file.no_verdict).toContain("never says who was in the wrong");
  });

  it("declared fields never influence an observed field", async () => {
    withChain(transferReceipt(STRANGER, 0.5));
    const plain = await performCaseFile(testEnv, { txHash: TX }, MINED);
    restoreFetch?.();
    withChain(transferReceipt(STRANGER, 0.5));
    const loud = await performCaseFile(
      testEnv,
      { txHash: TX, claim: "I was robbed of ten dollars", expectedAmountUsdc: 10 },
      MINED,
    );
    const observed = (file: typeof plain) => ({
      settlement: { ...file.settlement.attestation, observed_at: null, evidence_hash: null, signature: null, signature_jcs: null, query: null, reading: null },
      reconciliation: { ...file.reconciliation.reconciliation, observed_at: null, evidence_hash: null, signature: null, signature_jcs: null, reconciliation_id: null },
      door: file.door,
      delivery: file.delivery,
      mandate: file.mandate,
    });
    expect(observed(loud)).toEqual(observed(plain));
    expect(loud.settlement.attestation?.amount_usdc).toBe(0.5);
    expect(loud.declared.expected_amount_usdc).toBe(10);
  });
});

describe("the shelf, the copy, and the door", () => {
  it("is priced the same in every copy map and named where the other observation items are", () => {
    const item = getMenuItem("the_case_file");
    expect(item?.price_usdc).toBe(0.25);
    expect(item?.reads).toBe("chain_read");
    expect(CAPABILITY_QUERY["the_case_file"]).toBeTruthy();
    expect(SPEC_WHY_USE["the_case_file"]).toBeTruthy();
    expect(SPEC_RETURNS["the_case_file"]).toContain("/case/{id}");
    expect(artifactClassForItem("the_case_file")?.verify_url).toBe("/case/{case_id}");
    expect(clawhubBundle).toContain("`the_case_file` ($0.25)");
    expect(MENU_ITEMS.map((entry) => entry.id)).toContain("the_case_file");
  });

  it("assembles through the till, binds the evidence hash, and is the same case for the same tx and mandate inside a day", async () => {
    withChain(transferReceipt(STRANGER, 0.5));
    await seedMandate("m_till", 2); await seedMandate("m_other", 3);
    const url = `${BASE}/api/buy/the_case_file?tx_hash=${TX}&mandate_id=m_till&claim=empty%20body`;
    const first = await buy(url);
    expect(facilitator.settleCalls).toBeGreaterThanOrEqual(1);
    const caseId = String(first["case_id"]);
    expect(caseId.startsWith("case_")).toBe(true);
    expect(first["case_url"]).toBe(`/case/${caseId}`);
    expect(first["sections_present"]).toEqual(["settlement", "reconciliation", "mandate"]);

    const served = await json(await SELF.fetch(`${BASE}/case/${caseId}`));
    expect(served["read_this_first"]).toBeTruthy();
    const record = served["case"] as Record<string, unknown>;
    expect(record["case_id"]).toBe(caseId);
    const verify = await json(await SELF.fetch(`${BASE}/api/verify/${String(served["cert_id"])}`));
    const cert = verify["certificate"] as Record<string, unknown>;
    expect(cert["attests"]).toBe(record["evidence_hash"]);

    const again = await buy(url);
    expect(again["case_id"]).toBe(caseId);
    expect(again["reused"]).toBe(true);

    const other = await buy(`${BASE}/api/buy/the_case_file?tx_hash=${TX}&mandate_id=m_other`);
    expect(other["case_id"]).not.toBe(caseId);
  });

  it("refuses a bad hash, an over-long claim and a bad url on the paid request, before any money moves", async () => {
    // The checks run when a payment is presented, ahead of the gate:
    // the unpaid GET is the 402 with terms, the paid retry is refused
    // with charged:false and nothing settled.
    const settledBefore = facilitator.settleCalls;
    async function paidTo(url: string): Promise<Response> {
      const challenge = await SELF.fetch(`${BASE}/api/buy/the_case_file?tx_hash=${TX}`);
      const accepted = decodePaymentRequired(challenge).accepts[0]!;
      return SELF.fetch(url, { headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) } });
    }
    const noHash = await paidTo(`${BASE}/api/buy/the_case_file`);
    expect(noHash.status).toBe(400);
    expect((await json(noHash))["charged"]).toBe(false);
    const longClaim = await paidTo(`${BASE}/api/buy/the_case_file?tx_hash=${TX}&claim=${"x".repeat(1001)}`);
    expect(longClaim.status).toBe(400);
    const badUrl = await paidTo(`${BASE}/api/buy/the_case_file?tx_hash=${TX}&url=not-a-url`);
    expect(badUrl.status).toBe(400);
    expect(facilitator.settleCalls).toBe(settledBefore);
  });

  it("an unknown case id is a 404 that names the item", async () => {
    const missing = await SELF.fetch(`${BASE}/case/case_nothing`);
    expect(missing.status).toBe(404);
    expect(String((await json(missing))["error"])).toContain("/api/buy/the_case_file");
  });
});
