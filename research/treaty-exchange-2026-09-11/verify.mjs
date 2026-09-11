// The treaty running in the direction we owe: a StillOS receipt checked
// with Node's stock crypto and nothing of theirs in the path.
//   node research/treaty-exchange-2026-09-11/verify.mjs
import { readFileSync } from "node:fs";
import { createHash, createPublicKey, verify } from "node:crypto";
const here = new URL(".", import.meta.url);
const r = JSON.parse(readFileSync(new URL("stillos-receipt-e851d799.json", here), "utf8")).receipt;
const kr = JSON.parse(readFileSync(new URL("stillos-keyring.json", here), "utf8"));
const sha = (s) => createHash("sha256").update(s).digest("hex");
const entry = kr.keys.find((k) => k.fingerprint === r.notary_fp);
const under = (pem) => verify(null, Buffer.from(r.receipt_hash, "ascii"), createPublicKey(pem), Buffer.from(r.signature, "base64"));
const preimage = JSON.stringify({ agent: r.agent, claim_sha256: r.claim_sha256, ts: r.ts, prev_hash: r.prev_hash, notary_fp: r.notary_fp, resolver_hash: r.resolver_hash });
const claim = "SCVD receipt-treaty PR #635 (first treaty entry: StillOS Notary) is merged to seancrecord/scvd-general-store-repo main";
console.log(JSON.stringify({
  receipt_hash: r.receipt_hash,
  key_resolved: entry ? `${entry.fingerprint} (${entry.status})` : null,
  signature_valid_under_resolved_key: entry ? under(entry.public_key_pem) : null,
  signature_valid_under_retired_key: under(kr.keys.find((k) => k.status === "retired").public_key_pem),
  receipt_hash_recomputed: sha(preimage) === r.receipt_hash,
  receipt_hash_preimage: "JSON of {agent, claim_sha256, ts, prev_hash, notary_fp, resolver_hash} in that order",
  claim_sha256_published: r.claim_sha256,
  sha256_of_claim_text_as_given: sha(claim),
  claim_binding_reproduced: sha(claim) === r.claim_sha256,
}, null, 2));
