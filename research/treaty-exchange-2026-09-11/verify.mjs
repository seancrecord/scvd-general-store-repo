// The treaty running in the direction we owe: a StillOS receipt checked
// with Node's stock crypto and nothing of theirs in the path.
//   node research/treaty-exchange-2026-09-11/verify.mjs [receipt.json]
import { readFileSync } from "node:fs";
import { createHash, createPublicKey, verify } from "node:crypto";
const here = new URL(".", import.meta.url);
const receiptFile = process.argv[2] ?? "stillos-receipt-e851d799.json";
const r = JSON.parse(readFileSync(new URL(receiptFile, here), "utf8")).receipt;
const kr = JSON.parse(readFileSync(new URL("stillos-keyring.json", here), "utf8"));
const sha = (s) => createHash("sha256").update(s).digest("hex");
const entry = kr.keys.find((k) => k.fingerprint === r.notary_fp);
const under = (pem) => verify(null, Buffer.from(r.receipt_hash, "ascii"), createPublicKey(pem), Buffer.from(r.signature, "base64"));
const preimage = JSON.stringify({ agent: r.agent, claim_sha256: r.claim_sha256, ts: r.ts, prev_hash: r.prev_hash, notary_fp: r.notary_fp, resolver_hash: r.resolver_hash });
const claim = "SCVD receipt-treaty PR #635 (first treaty entry: StillOS Notary) is merged to seancrecord/scvd-general-store-repo main";
/*
 * THE CLAIM BINDING, answered 2026-09-12. `claim_sha256` does not
 * commit to the claim TEXT: on a resolved_verdict it commits to the
 * sealed verdict object, which is why no wrapping of the sentence
 * closed it. StillOS now serves those literal bytes at
 * /notary/preimage?hash=<receipt_hash>, so the binding is checkable
 * without reconstructing anyone's key order — hash the bytes as
 * served. Drop them beside a receipt as <receipt-file>.preimage and
 * this check runs; absent, it reports that it had nothing to hash
 * rather than passing quietly.
 */
console.log(JSON.stringify({
  receipt_hash: r.receipt_hash,
  key_resolved: entry ? `${entry.fingerprint} (${entry.status})` : null,
  signature_valid_under_resolved_key: entry ? under(entry.public_key_pem) : null,
  signature_valid_under_retired_key: under(kr.keys.find((k) => k.status === "retired").public_key_pem),
  receipt_hash_recomputed: sha(preimage) === r.receipt_hash,
  receipt_hash_preimage: "JSON of {agent, claim_sha256, ts, prev_hash, notary_fp, resolver_hash} in that order",
  claim_sha256_published: r.claim_sha256,
  sha256_of_claim_text_as_given: sha(claim),
  claim_binding_reproduced_from_claim_text: sha(claim) === r.claim_sha256,
  ...preimageCheck(),
}, null, 2));

function preimageCheck() {
  // The bytes exactly as their endpoint served them, never re-encoded:
  // a re-serialization here would be this checker reconstructing the
  // preimage rather than checking the one they published.
  const path = new URL(`${receiptFile}.preimage`, here);
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch {
    return {
      claim_preimage: "not supplied beside this receipt; the claim_sha256 binding was not checked",
    };
  }
  return {
    claim_preimage_bytes: bytes.length,
    claim_preimage_sha256: createHash("sha256").update(bytes).digest("hex"),
    claim_binding_reproduced_from_published_preimage:
      createHash("sha256").update(bytes).digest("hex") === r.claim_sha256,
  };
}
