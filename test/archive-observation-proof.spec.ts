import { expect, it } from "vitest";
import { verifyMessageSignature } from "@/lib/signing";
import { sha256Hex } from "@/lib/idempotency";
import { jcsCanonicalize } from "@/lib/jcs";
import { installLaborAdmissionHarness, laborNetworks, sendLabor, signLabor } from "./helpers/labor-admission";
import { items, shelves, call, object, request } from "./helpers/buyer-harness";

installLaborAdmissionHarness();
const reports = [
  { id: "spot_check", field: "spot_check", payload: "record", instructions: "how_to_verify" },
  { id: "provenance_check", field: "provenance_check", payload: "record", instructions: "how_to_verify" },
  { id: "passport_refresh", field: "refresh", payload: "observation", instructions: "verify_note" },
  { id: "trust_profile", field: "profile", payload: "record", instructions: "verify_note" },
];
for (const { id, field, payload, instructions } of reports) for (const network of laborNetworks()) for (const door of ["http", "mcp", "mcp-standard"] as const) {
  it(`${id} ${network} ${door}: the recipient can independently verify both the report and certificate`, async () => {
    const item = items.find(i => i.id === id)!;
    const canary = `SCVD-E2E-${Date.now()}-${crypto.randomUUID()}`;
    const args = id === "spot_check" ? { host: "buyer-fixture.example" }
      : id === "provenance_check" ? { address: "0x1111111111111111111111111111111111111111" }
      : { url: `https://buyer-fixture.example/api/paid?subject=${canary}` };
    const offer = (await call(item, "mcp", args, shelves(item)[0])).offers.find(o => o.network === network)!;
    const response = await sendLabor(id, door, args, await signLabor(offer));
    expect(response.refused).toBe(false);
    const body = response.body, proof = object(body.observation), record = object(proof[payload]);
    expect(record).toEqual(body[field]);
    if (args.url) expect(record.url).toBe(args.url);
    expect(JSON.parse(String(proof.signed_payload))).toEqual(record);
    expect(await verifyMessageSignature(String(proof.signed_payload), String(proof.signature), String(proof.public_key))).toBe(true);
    expect(await verifyMessageSignature(jcsCanonicalize(record), String(proof.signature_jcs), String(proof.public_key))).toBe(true);
    const tampered = { ...record, ...(args.url ? { url: "https://wrong-subject.example/" } : { asked_at: "2099-01-01T00:00:00Z" }) };
    expect(await verifyMessageSignature(JSON.stringify(tampered), String(proof.signature), String(proof.public_key))).toBe(false);
    expect(await verifyMessageSignature(jcsCanonicalize(tampered), String(proof.signature_jcs), String(proof.public_key))).toBe(false);
    expect(await sha256Hex(String(proof.signed_payload))).toBe(proof.evidence_hash);
    const certificate = object(JSON.parse(String(body.signed_payload)));
    expect(certificate.attests).toBe(proof.evidence_hash);
    expect(body[instructions]).toContain("observation.signed_payload");
    expect(await verifyMessageSignature(String(body.signed_payload), String(body.signature), String(body.public_key))).toBe(true);
    expect(await verifyMessageSignature(jcsCanonicalize(certificate), String(body.signature_jcs), String(body.public_key))).toBe(true);
    expect(certificate.cert_id).toBe(body.cert_id ?? object(body.certificate).cert_id);
    expect(object(await (await request(String(body.verify_url))).json()).valid).toBe(true);
  });
}
