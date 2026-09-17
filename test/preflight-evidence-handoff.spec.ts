import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { PREFLIGHT_BATTERY, theRestOfTheLadder } from "@/services/preflight";
import { getMenuItem } from "@/store/menu";
import { buyerLinks } from "@/lib/buyer-contract";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { performServiceAudit } from "@/services/service-audit";
import { getPublicKeyHex, signMessage } from "@/lib/signing";
import { sha256Hex } from "@/lib/idempotency";
import { createEvidenceBundle, evidenceBase64, verifyEvidenceBundle } from "../verifier/evidence-bundle.js";
import skill from "../skills/scvd-x402-verification/SKILL.md?raw";
import type { Env } from "@/types";

const BASE = "https://scvd.store";

describe("the unsigned preflight's evidence handoff", () => {
  beforeAll(() => installFacilitatorMock());

  it("distinguishes the unsigned reading from a fresh paid observation", () => {
    const ladder = theRestOfTheLadder(PREFLIGHT_BATTERY, BASE);
    expect(ladder.current_reading).toMatchObject({ signed: false, proves_payment_or_delivery: false });
    expect(ladder.signed_copy_of_this_reading).toMatchObject({
      observation: "fresh_probe",
      signs_previous_preflight: false,
      requires_spend_authorization: true,
    });
  });

  it("hands the buyer an actual item contract and an unpaid quote", async () => {
    const ladder = theRestOfTheLadder(PREFLIGHT_BATTERY, BASE);
    const handoff = ladder.signed_copy_of_this_reading as Record<string, unknown>;
    const item = getMenuItem("service_audit")!;
    expect(handoff).toMatchObject(buyerLinks(item, BASE));
    expect(handoff.price_usdc).toBe(item.price_usdc);
    const contract = await SELF.fetch(String(handoff.input_contract_url));
    expect(contract.status).toBe(200);
    const quote = await SELF.fetch(String(handoff.url));
    expect(quote.status).toBe(402);
    expect(quote.headers.get("PAYMENT-REQUIRED")).toBeTruthy();
    const guide = await SELF.fetch(String(handoff.guide_url));
    expect(guide.status).toBe(200);
    expect(guide.headers.get("content-type")).toContain("text/markdown");
  });

  it("the skill's extraction retains the real audit core, including gaps, and detects tampering", async () => {
    const testEnv = env as unknown as Env;
    const audit = await performServiceAudit(testEnv, "https://merchant.example/paid-endpoint", {
      now: new Date("2026-09-16T12:00:00Z"),
      fetch: async () => { throw new Error("fixture cannot reach merchant"); },
    });
    // Follow the literal field exclusions printed in the installable guide.
    // Hashing a whole report or dropping a new core field must not pass.
    const extraction = /const \{ ([^}]+), \.\.\.core \} = audit;/.exec(skill);
    expect(extraction, "the guide must supply a runnable core extraction").not.toBeNull();
    const omitted = extraction![1]!.split(",").map((name) => name.trim());
    const core = Object.fromEntries(Object.entries(audit).filter(([name]) => !omitted.includes(name)));
    const bytes = JSON.stringify(core);
    expect(await sha256Hex(bytes)).toBe(audit.evidence_hash);
    expect(core.verdict).toBe("unreachable");
    expect(core.checks).toEqual(audit.checks);

    // A fixture certificate uses the real report's binding, then the
    // independent portable verifier consumes what the guide retained.
    const signed_payload = JSON.stringify({ cert_id: "cert_handoff_fixture", attests: audit.evidence_hash });
    const key = await getPublicKeyHex(testEnv.SIGNING_KEY);
    const response = {
      algorithm: "ed25519", signed_payload, public_key: key,
      signature: (await signMessage(signed_payload, testEnv.SIGNING_KEY)).signature,
    };
    const incomplete = await verifyEvidenceBundle(await createEvidenceBundle(response), { publicKey: key });
    expect(incomplete.valid).toBe(true);
    expect(incomplete.evidence_complete).toBe(false);
    expect(incomplete.missing_evidence).toContain("attests");
    const bundle = await createEvidenceBundle(response, {
      attachments: [{ name: "observation.json", bytes: new TextEncoder().encode(bytes) }],
    });
    expect(await verifyEvidenceBundle(bundle, { publicKey: key })).toMatchObject({ valid: true, evidence_complete: true });
    const tampered = JSON.stringify({ ...core, verdict: "ready" });
    bundle.attachments[0]!.bytes_base64 = evidenceBase64(new TextEncoder().encode(tampered));
    bundle.attachments[0]!.sha256 = await sha256Hex(tampered);
    expect((await verifyEvidenceBundle(bundle, { publicKey: key })).valid).toBe(false);
  });
});
