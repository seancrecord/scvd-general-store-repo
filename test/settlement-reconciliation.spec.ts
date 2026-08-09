import { keccak256, toHex } from "viem";
import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  APPROVAL_TOPIC,
  AUTHORIZATION_USED_TOPIC,
  BASE_USDC,
  TRANSFER_TOPIC,
  usdcApprovals,
} from "@/lib/base-rpc";
import type { RpcReceipt } from "@/lib/base-rpc";
import {
  reconcileFacts,
  reconcileSettlement,
} from "@/services/settlement-reconciliation";
import { reconciliationNote } from "@/store/copy/deliverables";
import { getMenuItem } from "@/store";
import { ARTIFACT_CLASSES } from "@/store/attestation-spec";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * SETTLEMENT RECONCILIATION — the amount taken against the ceiling in
 * force.
 *
 * The arithmetic is trivial and is not what these tests are about.
 * THE WHOLE ARTIFACT TURNS ON ONE FIELD: `cap_observed`. A ceiling we
 * read off Base and a ceiling somebody handed us are different kinds
 * of fact, and signing them identically would put this store's key on
 * the commissioning party's claim — the recorded referral-certificate
 * defect, repeated.
 *
 * So most of what follows is about keeping those two apart under
 * pressure: when the caller declares a cap the chain also shows, when
 * they declare one it does not, and when the honest answer is that
 * there was never any discretion to exercise at all.
 */

const PAYER = "0x1111111111111111111111111111111111111111";
const PAYEE = "0x2222222222222222222222222222222222222222";
const SPENDER = "0x3333333333333333333333333333333333333333";
const TX = `0x${"ab".repeat(32)}`;

function topicFor(address: string): string {
  return `0x000000000000000000000000${address.slice(2)}`;
}

/** USDC has six decimals, so 1 USDC is 1_000_000 units. */
function units(usdc: number): string {
  return `0x${BigInt(Math.round(usdc * 1_000_000)).toString(16)}`;
}

function transferLog(from: string, to: string, usdc: number) {
  return {
    address: BASE_USDC,
    topics: [TRANSFER_TOPIC, topicFor(from), topicFor(to)],
    data: units(usdc),
  };
}

function approvalLog(owner: string, spender: string, usdc: number) {
  return {
    address: BASE_USDC,
    topics: [APPROVAL_TOPIC, topicFor(owner), topicFor(spender)],
    data: units(usdc),
  };
}

function authorizationLog(authorizer: string) {
  return {
    address: BASE_USDC,
    topics: [AUTHORIZATION_USED_TOPIC, topicFor(authorizer), `0x${"11".repeat(32)}`],
    data: "0x",
  };
}

function receipt(logs: RpcReceipt["logs"], status = "0x1"): RpcReceipt {
  return { status, blockNumber: "0x64", logs };
}

describe("the Approval topic", () => {
  it("is the real event signature, derived rather than trusted", () => {
    // Same discipline as the Transfer and AuthorizationUsed topics: a
    // typo here would silently report every capped payment as having
    // no observable ceiling, which is the failure that looks like
    // caution and is actually blindness.
    expect(APPROVAL_TOPIC).toBe(
      keccak256(toHex("Approval(address,address,uint256)")),
    );
  });

  it("decodes an approval and ignores other tokens", () => {
    const approvals = usdcApprovals(
      receipt([
        approvalLog(PAYER, SPENDER, 10),
        {
          address: "0x9999999999999999999999999999999999999999",
          topics: [APPROVAL_TOPIC, topicFor(PAYER), topicFor(SPENDER)],
          data: units(999),
        },
      ]),
    );
    expect(approvals).toHaveLength(1);
    expect(approvals[0]!.amount).toBe(10_000_000n);
  });
});

describe("what one receipt can be made to say", () => {
  it("finds an on-chain ceiling when the approval is in the same transaction", () => {
    const facts = reconcileFacts(
      receipt([approvalLog(PAYER, SPENDER, 10), transferLog(PAYER, PAYEE, 3)]),
      { txHash: TX },
      100,
    );
    expect(facts.capSource).toBe("chain_same_tx_approval");
    expect(facts.capUnits).toBe(10_000_000n);
    expect(facts.settledUnits).toBe(3_000_000n);
  });

  it("calls an EIP-3009 payment 'no discretion' rather than 'exactly at cap'", () => {
    /*
     * The distinction is the honest one. EIP-3009 fixes the value
     * inside the payer's signed digest, so the spender COULD NOT have
     * taken a different figure. Reporting that as "within cap" would
     * imply restraint where there was only arithmetic.
     */
    const facts = reconcileFacts(
      receipt([authorizationLog(PAYER), transferLog(PAYER, PAYEE, 5)]),
      { txHash: TX },
      100,
    );
    expect(facts.capSource).toBe("chain_eip3009_fixed_value");
    expect(facts.capUnits).toBe(facts.settledUnits);
  });

  it("reports no ceiling at all rather than guessing one", () => {
    const facts = reconcileFacts(
      receipt([transferLog(PAYER, PAYEE, 5)]),
      { txHash: TX },
      100,
    );
    expect(facts.capSource).toBe("none");
    expect(facts.capUnits).toBeNull();
  });

  it("names the largest matching transfer rather than summing the legs", () => {
    // A receipt can carry a fee split or a refund leg. Adding them
    // together would invent a payment nobody made.
    const facts = reconcileFacts(
      receipt([
        transferLog(PAYER, PAYEE, 4),
        transferLog(PAYER, SPENDER, 1),
      ]),
      { txHash: TX },
      100,
    );
    expect(facts.settledUnits).toBe(4_000_000n);
    expect(facts.to?.toLowerCase()).toBe(PAYEE);
  });

  it("narrows by recipient when the question says one", () => {
    const facts = reconcileFacts(
      receipt([
        transferLog(PAYER, PAYEE, 4),
        transferLog(PAYER, SPENDER, 9),
      ]),
      { txHash: TX, recipient: PAYEE },
      100,
    );
    expect(facts.settledUnits).toBe(4_000_000n);
  });

  it("finds nothing in a reverted transaction, and does not read its logs", () => {
    const facts = reconcileFacts(
      receipt([transferLog(PAYER, PAYEE, 5)], "0x0"),
      { txHash: TX },
      100,
    );
    expect(facts.settledUnits).toBeNull();
    expect(facts.confirmations).toBe(0);
  });

  it("ignores an approval signed by somebody other than the payer", () => {
    // A ceiling granted by a third party is not the ceiling this payer
    // was operating under, and quoting it would be worse than quoting
    // nothing.
    const facts = reconcileFacts(
      receipt([approvalLog(SPENDER, PAYEE, 100), transferLog(PAYER, PAYEE, 5)]),
      { txHash: TX },
      100,
    );
    expect(facts.capSource).toBe("none");
  });
});

describe("the signed observation", () => {
  const rpc = (result: unknown) =>
    new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
      headers: { "content-type": "application/json" },
    });

  function withRpc(receiptBody: RpcReceipt | null, head = "0x80"): Env {
    const original = globalThis.fetch;
    let call = 0;
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { method: string };
      call += 1;
      if (body.method === "eth_blockNumber") return rpc(head);
      return rpc(receiptBody);
    }) as typeof fetch;
    // Restored by the caller via restore(); vitest runs these serially.
    (globalThis as Record<string, unknown>)["__restoreFetch"] = () => {
      globalThis.fetch = original;
      return call;
    };
    return testEnv;
  }

  function restore(): void {
    (
      (globalThis as Record<string, unknown>)["__restoreFetch"] as () => number
    )();
  }

  it("says WITHIN CAP and marks the ceiling as observed when it was on the chain", async () => {
    const observation = await reconcileSettlement(
      withRpc(receipt([approvalLog(PAYER, SPENDER, 10), transferLog(PAYER, PAYEE, 3)])),
      { txHash: TX },
    );
    restore();
    expect(observation.verdict).toBe("within_cap");
    expect(observation.cap_observed).toBe(true);
    expect(observation.cap_source).toBe("chain_same_tx_approval");
    expect(observation.discretion_usdc).toBe(7);
    expect(observation.signature).toMatch(/^[0-9a-f]+$/);
  });

  it("marks a DECLARED ceiling as not observed, and says whose number it is", async () => {
    /*
     * THE DEFECT THIS PRODUCT SHIPPED THE FIX FOR. Without the split,
     * a buyer sends declared_cap_usdc=100, we sign "within_cap: true",
     * and this store's key is now on the buyer's own arithmetic.
     */
    const observation = await reconcileSettlement(
      withRpc(receipt([transferLog(PAYER, PAYEE, 3)])),
      { txHash: TX, declaredCapUsdc: 100 },
    );
    restore();
    expect(observation.verdict).toBe("within_cap");
    expect(observation.cap_observed).toBe(false);
    expect(observation.cap_source).toBe("declared_by_caller");
    const caveat = observation.what_this_cannot_see.join(" ");
    expect(caveat).toContain("WHETHER THE DECLARED CEILING IS REAL");
    expect(caveat).toContain("party it benefits");
  });

  it("never lets a declared ceiling override one found on the chain", async () => {
    // A caller who declares 100 against an on-chain approval of 10
    // does not get to widen their own cap. The chain wins, and the
    // query is echoed so the disagreement is visible.
    const observation = await reconcileSettlement(
      withRpc(receipt([approvalLog(PAYER, SPENDER, 10), transferLog(PAYER, PAYEE, 50)])),
      { txHash: TX, declaredCapUsdc: 100 },
    );
    restore();
    expect(observation.cap_usdc).toBe(10);
    expect(observation.cap_observed).toBe(true);
    expect(observation.verdict).toBe("over_cap");
    expect(observation.query.declaredCapUsdc).toBe(100);
  });

  it("declines to imply a limit it never saw", async () => {
    const observation = await reconcileSettlement(
      withRpc(receipt([transferLog(PAYER, PAYEE, 3)])),
      { txHash: TX },
    );
    restore();
    expect(observation.verdict).toBe("cap_not_observable");
    expect(observation.cap_usdc).toBeNull();
    expect(observation.reading).toContain("decline to imply a limit");
  });

  it("says NO DISCRETION for EIP-3009 instead of claiming restraint", async () => {
    const observation = await reconcileSettlement(
      withRpc(receipt([authorizationLog(PAYER), transferLog(PAYER, PAYEE, 5)])),
      { txHash: TX },
    );
    restore();
    expect(observation.verdict).toBe("no_discretion");
    expect(observation.cap_observed).toBe(true);
    expect(observation.discretion_usdc).toBe(0);
    expect(observation.reading).toContain("no discretion to exercise");
  });

  it("reports nothing to reconcile without blaming anybody for it", async () => {
    const observation = await reconcileSettlement(withRpc(null), { txHash: TX });
    restore();
    expect(observation.verdict).toBe("no_settlement");
    expect(observation.settled_usdc).toBeNull();
    expect(observation.reading).toContain("not the same as something being wrong");
  });

  it("says out loud that the subtraction is free and the witness is the product", async () => {
    /*
     * The review's second finding: within_cap is arithmetic anyone can
     * do, so a buyer works that out afterwards and wonders what they
     * paid for. Better they read it on the artifact.
     */
    const observation = await reconcileSettlement(
      withRpc(receipt([transferLog(PAYER, PAYEE, 3)])),
      { txHash: TX, declaredCapUsdc: 5 },
    );
    restore();
    expect(observation.why_this_is_not_just_subtraction).toContain(
      "free and you do not need us for it",
    );
    expect(observation.why_this_is_not_just_subtraction).toContain(
      "which of the two it actually observed",
    );
  });
});

describe("the shelf and the spec", () => {
  it("is listed with the declared cap named as declared, right on the constraints", () => {
    const item = getMenuItem("settlement_reconciliation");
    expect(item).toBeTruthy();
    const constraints = item!.constraints?.join(" ") ?? "";
    expect(constraints).toContain("DECLARED, never as observed");
    expect(constraints).toContain("never allowed to override");
    // The listing must not promise it can see a ceiling set earlier.
    expect(constraints).toContain("not observed");
  });

  it("is an artifact class inside the existing namespace, not a new one", () => {
    // The spec checklist's second question, and three of four drafts
    // got it wrong. Four namespaces is confetti, not a land grab.
    const entry = ARTIFACT_CLASSES.find(
      (artifactClass) => artifactClass.id === "settlement_reconciliation",
    );
    expect(entry).toBeTruthy();
    expect(entry!.trust_model).toBe("third_party_observation");
    expect(entry!.does_not_prove).toContain("DECLARED ceiling is real");
    expect(entry!.verify_url).toBe("/api/reconciliation/{reconciliation_id}");
  });

  it("warns the buyer when they bought the weaker version of the answer", () => {
    // The note is where a buyer actually looks. A "within cap" off
    // their own number is not worth showing to a counterparty, and
    // they should learn that at purchase rather than in a dispute.
    const weak = reconciliationNote("within_cap", false);
    expect(weak).toContain("YOU TOLD US");
    expect(weak).toContain("we did not observe the cap");
    const strong = reconciliationNote("within_cap", true);
    expect(strong).toContain("both numbers were on the chain");
    expect(reconciliationNote("no_discretion", true)).toContain(
      "structural rather than lucky",
    );
  });
});

describe("the guard, before money moves", () => {
  const buying = { "PAYMENT-SIGNATURE": "not-a-real-signature" };
  const BASE_URL = "https://scvd.store";

  it("refuses with nothing to look up", async () => {
    const response = await SELF.fetch(
      `${BASE_URL}/api/buy/settlement_reconciliation`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    expect(
      String(((await response.json()) as { error: string }).error),
    ).toContain("No hash, no charge");
  });

  it("refuses something that is not a transaction hash", async () => {
    const response = await SELF.fetch(
      `${BASE_URL}/api/buy/settlement_reconciliation?tx_hash=not-a-hash`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
  });

  it("refuses an unparseable declared cap instead of silently dropping it", async () => {
    /*
     * THE QUIET FAILURE THIS PREVENTS. A cap of "ten dollars" that we
     * shrug off becomes "no cap declared", which is a DIFFERENT
     * verdict — cap_not_observable instead of within_cap — and the
     * buyer gets a coherent-looking artifact answering a question
     * they did not ask.
     */
    const response = await SELF.fetch(
      `${BASE_URL}/api/buy/settlement_reconciliation?tx_hash=${TX}&declared_cap_usdc=ten`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    const error = String(((await response.json()) as { error: string }).error);
    expect(error).toContain("would otherwise read as 'no cap declared'");
    expect(error).toContain("Nothing charged");
  });

  it("still quotes a price to anyone who only asks, per the probe rule", async () => {
    const response = await SELF.fetch(
      `${BASE_URL}/api/buy/settlement_reconciliation`,
    );
    expect(response.status).not.toBe(400);
  });

  it("publishes the required hash and warns about the declared cap in the schema itself", async () => {
    // An agent reads the schema to decide what to send. The warning
    // has to live where that decision is made, not only on the report.
    const body = (await (
      await SELF.fetch(`${BASE_URL}/.well-known/x402.json`)
    ).json()) as { resources: Record<string, never>[] };
    const resource = body.resources.find(
      (entry: Record<string, never>) =>
        (entry as { resourceUrl?: string }).resourceUrl ===
        `${BASE_URL}/api/buy/settlement_reconciliation`,
    ) as unknown as { inputSchema: { required: string[]; properties: Record<string, { description: string }> } };
    expect(resource.inputSchema.required).toContain("tx_hash");
    const cap = resource.inputSchema.properties["declared_cap_usdc"]!;
    expect(cap.description).toContain("DECLARED, never as observed");
    expect(cap.description).toContain("never override");
  });

  it("serves a 404 that points at the item rather than a bare miss", async () => {
    const response = await SELF.fetch(`${BASE_URL}/api/reconciliation/srec_nope`);
    expect(response.status).toBe(404);
    expect(
      String(((await response.json()) as { error: string }).error),
    ).toContain("/api/buy/settlement_reconciliation");
  });
});
