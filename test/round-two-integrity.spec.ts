import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { parseProbeTarget, ProbeTargetRefused } from "@/lib/probe-target";
import { performServiceAudit } from "@/services/service-audit";
import { performOnpageAudit } from "@/services/onpage-audit";
import { fulfillPurchase } from "@/services/fulfillment";
import { mintCertificate } from "@/services/certificates";
import { neverJudgedBlock, paymentNetwork } from "@/lib/decline-diagnosis";
import { serviceAuditNote, onpageAuditNote, signatureCardNote } from "@/store/copy/deliverables";
import type { Env, MenuItem } from "@/types";
import type { PendingPayment } from "@/lib/payments";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

beforeAll(() => {
  installFacilitatorMock();
});

/**
 * CV'S SECOND ROUND (2026-09-04), the artifact-integrity half.
 *
 * With the buyer's url dropped, the paid audit ran on an empty string,
 * `new URL("")` threw inside the probe, the catch signed the verdict
 * "unreachable", and the deliverable said "We knocked. Nobody came."
 * No knock was made. The same session minted two attestation_bundle
 * certificates whose `attests` is sha256("") — a sheaf of zero
 * observations — and /api/verify called them valid, correctly, and
 * said nothing else. The door law now stops the inputs at the door;
 * this file is about what the till and the artifacts say if anything
 * ever gets past it again.
 */

const item = (id: string): MenuItem => MENU_ITEMS.find((entry) => entry.id === id)!;

describe("a target that is not a URL is refused, never signed as unreachable", () => {
  it("the shared parser refuses under the probe-target law", () => {
    expect(() => parseProbeTarget("")).toThrow(ProbeTargetRefused);
    expect(() => parseProbeTarget("not a url")).toThrow(/not a URL/);
    expect(parseProbeTarget("https://example.com/x").host).toBe("example.com");
  });

  it("the service audit signs 'refused: nothing was dialled', and its note says we did not knock", async () => {
    const audit = await performServiceAudit(testEnv, "", {
      fetch: (async () => {
        throw new Error("the probe must never be reached for a non-URL");
      }) as unknown as typeof fetch,
    });
    expect(audit.verdict).toBe("refused");
    expect(audit.checks[0]?.name).toBe("probe-target-refused");
    expect(audit.checks[0]?.detail).toContain("no request was made");
    expect(audit.checks[0]?.detail).not.toContain("network path");
    // The prose the buyer reads, keyed on the same verdict.
    expect(serviceAuditNote(audit.verdict)).toContain("We did not knock");
    expect(serviceAuditNote(audit.verdict)).not.toContain("Nobody came");
  });

  it("the page audit takes the same law through the same parser", async () => {
    const audit = await performOnpageAudit(testEnv, "");
    expect(audit.verdict).toBe("refused");
    expect(onpageAuditNote("refused")).toContain("We did not knock");
    expect(signatureCardNote("refused")).toContain("We did not knock");
  });
});

describe("a sheaf of nothing is refused before settlement, never signed", () => {
  it("the till throws before presenting the authorization", async () => {
    let settleCalls = 0;
    const pending: PendingPayment = {
      paidUsdc: 0.05,
      tipUsdc: 0,
      settle: async () => {
        settleCalls += 1;
        throw new Error("settle must not be reached");
      },
    };
    await expect(
      fulfillPurchase(testEnv, item("attestation_bundle"), pending, {
        bundleTxHashes: [],
      }),
    ).rejects.toThrow(/sheaf of nothing/);
    expect(settleCalls).toBe(0);
  });
});

describe("verify names an attestation of nothing", () => {
  const sha256 = async (text: string): Promise<string> => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  it("says so beside valid: true when attests is sha256 of the empty string", async () => {
    const minted = await mintCertificate(testEnv, {
      itemId: "attestation_bundle",
      attests: await sha256(""),
    });
    const verify = (await (
      await SELF.fetch(`${BASE}/api/verify/${minted.certificate.cert_id}`)
    ).json()) as Record<string, unknown>;
    // The signature IS valid — that is exactly the problem being named.
    expect(verify["valid"]).toBe(true);
    expect(String(verify["attests_note"])).toContain("EMPTY STRING");
  });

  it("says nothing of the kind about a real attestation", async () => {
    const minted = await mintCertificate(testEnv, {
      itemId: "attestation_bundle",
      attests: await sha256("two settled receipts"),
    });
    const verify = (await (
      await SELF.fetch(`${BASE}/api/verify/${minted.certificate.cert_id}`)
    ).json()) as Record<string, unknown>;
    expect(verify["valid"]).toBe(true);
    expect(verify["attests_note"]).toBeUndefined();
  });
});

describe("the resend advice knows a Solana payload does not keep", () => {
  const headerFor = (network: string): string =>
    btoa(JSON.stringify({ x402Version: 2, accepted: { network }, payload: {} }));

  it("reads the rail off the payment header", () => {
    expect(paymentNetwork(headerFor("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"))).toMatch(/^solana:/);
    expect(paymentNetwork(headerFor("eip155:8453"))).toBe("eip155:8453");
    expect(paymentNetwork("not base64 json")).toBeUndefined();
  });

  it("adds the blockhash caveat on Solana and nowhere else", () => {
    const solana = neverJudgedBlock(undefined, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
    const retry = solana["retry"] as Record<string, unknown>;
    expect(String(retry["solana_blockhash"])).toContain("BlockhashNotFound");
    expect(String(retry["solana_blockhash"])).toContain("fresh transaction");
    const evm = neverJudgedBlock(1_900_000_000, "eip155:8453");
    expect((evm["retry"] as Record<string, unknown>)["solana_blockhash"]).toBeUndefined();
  });
});
