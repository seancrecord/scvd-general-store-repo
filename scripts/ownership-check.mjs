#!/usr/bin/env node
/**
 * npm run ownership:check — does the ownership proof this store
 * PUBLISHES still prove ownership of the wallets it is CURRENTLY
 * asking to be paid at?
 *
 * WHY A LIVE CHECK AND NOT A TEST. The proof is a signature over the
 * bare origin string by a payTo address, and it lives in a secret
 * (ORIGIN_OWNERSHIP_PROOFS) that the suite does not hold. The suite
 * guards the MECHANISM — that the message a keeper signs is the
 * message a reader verifies, and that an unset secret publishes no
 * claim at all (test/origin-ownership-proof.spec.ts). Only a read of
 * the deployed document can guard the VALUE, and exactly one ordinary
 * event silently falsifies it: rotating the payTo wallet. The old
 * proof keeps verifying against a wallet nobody is paying any more,
 * the new wallet is unproved, and every served surface still looks
 * right. Nothing else in this repository would notice.
 *
 * WHAT A READER DOES, reproduced rather than approximated. This is
 * @agentcash/discovery v1.7.5's own procedure, the one x402scan,
 * mppscan and AgentCash share: read
 * x-agentcash-provenance.ownershipProofs (falling back to the older
 * x-discovery.ownershipProofs) from the root of /openapi.json,
 * recover the EVM signer from the ORIGIN STRING with secp256k1, or
 * check an ed25519 signature for a Solana address, and match against
 * the payTo addresses the accepts name. A match is trust tier
 * `ownership_verified`; no match is `origin_hosted`.
 *
 * READ-ONLY. It fetches one public document of our own and verifies
 * signatures locally. It buys nothing, signs nothing, writes nothing.
 *
 * Usage, from the repo root:
 *
 *   npm run ownership:check                      # read the live store, report
 *   npm run ownership:check -- --base=http://localhost:8787
 *   npm run ownership:check -- --require-proof   # unproved is a FAILURE
 *   npm run ownership:check -- --json            # the reading, for a pipe
 *
 * EXIT CODES. 0 when every published proof matches a payTo the store
 * currently advertises (or when none is published and --require-proof
 * was not passed). 1 when a published proof matches nothing — the
 * stale-wallet case this script exists for — or when --require-proof
 * is set and no proof is published.
 */
import { recoverMessageAddress } from "viem";
import { verifyAsync } from "@noble/ed25519";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) =>
  args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;

const base = value("base", "https://scvd.store").replace(/\/$/, "");

/** The message a reader verifies: the bare origin, no trailing slash, no path. */
const origin = new URL(base).origin;

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function decodeBase58(text) {
  const bytes = [];
  for (const char of text) {
    const index = B58.indexOf(char);
    if (index < 0) return null;
    let carry = index;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of text) {
    if (char !== B58[0]) break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

const isEvm = (address) => /^0x[a-fA-F0-9]{40}$/.test(address);

async function verifyProof(proof, address) {
  try {
    if (isEvm(address)) {
      const signature = proof.startsWith("0x") ? proof : `0x${proof}`;
      const recovered = await recoverMessageAddress({ message: origin, signature });
      return recovered.toLowerCase() === address.toLowerCase();
    }
    const signature = decodeBase58(proof) ?? Uint8Array.from(Buffer.from(proof.replace(/^0x/, ""), "hex"));
    const publicKey = decodeBase58(address);
    if (!publicKey || signature.length !== 64) return false;
    return await verifyAsync(signature, new TextEncoder().encode(origin), publicKey);
  } catch {
    return false;
  }
}

const response = await fetch(`${base}/openapi.json`, { headers: { accept: "application/json" } });
if (!response.ok) {
  console.error(`ownership:check — could not read ${base}/openapi.json (HTTP ${response.status}).`);
  process.exit(1);
}
const doc = await response.json();

const provenance = doc["x-agentcash-provenance"] ?? doc["x-discovery"] ?? {};
const proofs = Array.isArray(provenance.ownershipProofs)
  ? provenance.ownershipProofs.filter((p) => typeof p === "string" && p.length > 0)
  : [];

/** Every payTo the document currently asks to be paid at. */
const payTo = new Set();
for (const item of Object.values(doc.paths ?? {})) {
  for (const operation of Object.values(item ?? {})) {
    const accepts = operation?.["x-payment-info"]?.accepts;
    if (!Array.isArray(accepts)) continue;
    for (const accept of accepts) if (accept?.payTo) payTo.add(accept.payTo);
  }
}
const addresses = [...payTo];

const verifiedAddresses = [];
const unmatchedProofs = [];
for (const proof of proofs) {
  let matched = null;
  for (const address of addresses) {
    if (await verifyProof(proof, address)) { matched = address; break; }
  }
  if (matched) verifiedAddresses.push(matched);
  else unmatchedProofs.push(proof);
}
const unproved = addresses.filter((a) => !verifiedAddresses.includes(a));
const tier = verifiedAddresses.length > 0 ? "ownership_verified" : "origin_hosted";

const reading = {
  origin,
  signed_message: origin,
  published_proofs: proofs.length,
  paid_to_addresses: addresses,
  verified_addresses: verifiedAddresses,
  unproved_addresses: unproved,
  unmatched_proofs: unmatchedProofs.length,
  trust_tier: tier,
};

if (flag("json")) {
  console.log(JSON.stringify(reading, null, 2));
} else {
  console.log(`Ownership of ${origin}, as a reader of /openapi.json sees it.\n`);
  console.log(`  message signed      ${origin}`);
  console.log(`  proofs published    ${proofs.length}`);
  console.log(`  payTo advertised    ${addresses.length}`);
  for (const address of addresses) {
    console.log(`    ${verifiedAddresses.includes(address) ? "proved  " : "unproved"}  ${address}`);
  }
  console.log(`  trust tier          ${tier}`);
  if (unmatchedProofs.length > 0) {
    console.log(`\n  ${unmatchedProofs.length} published proof(s) match NO advertised payTo.`);
    console.log("  That is the stale-wallet case: the proof still verifies against a");
    console.log("  wallet this store no longer asks to be paid at. Re-sign the origin");
    console.log("  with the current payTo key and replace ORIGIN_OWNERSHIP_PROOFS.");
  }
  if (proofs.length === 0) {
    console.log("\n  No proof published — the origin reads as origin_hosted, not");
    console.log("  ownership_verified. That is a missing claim, not a false one.");
    console.log(`  To prove it: sign the exact string ${origin} with a payTo key,`);
    console.log("  then `wrangler secret put ORIGIN_OWNERSHIP_PROOFS`.");
  }
}

if (unmatchedProofs.length > 0) process.exit(1);
if (proofs.length === 0 && flag("require-proof")) process.exit(1);
