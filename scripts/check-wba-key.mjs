#!/usr/bin/env node
/**
 * CHECK A CANDIDATE WEB BOT AUTH EGRESS SEED AGAINST THE LIVE DIRECTORY.
 *
 * Usage:  npm run keys:check:wba
 *
 * WHY THIS EXISTS. WBA_SIGNING_KEY is a Cloudflare Worker secret, and
 * Worker secrets are write-only: nothing can show you the seed the
 * store is signing its egress with. So when a seed turns up in a
 * password manager and you need to know whether it is THE one — before
 * handing it to the walkabout runner, and long before considering a
 * rotation that would replace the published key — the only honest
 * check is to derive from the candidate and compare against what the
 * store already serves.
 *
 * This is the egress key, NOT the artifact-signing key. Different key,
 * different lifecycle, different consequence if you get it wrong
 * (src/lib/web-bot-auth.ts says why they are separate). For the
 * artifact key's paper transcription, use `npm run keys:check`.
 *
 * WHAT IT DOES: derives the ed25519 public key, the base64url `x`, and
 * the RFC 7638 JWK thumbprint — the same three values, by the same
 * canonicalisation, that src/lib/web-bot-auth.ts derives to build the
 * directory and that scripts/lib/walkabout.mjs derives to sign a walk.
 * The thumbprint is the `kid`, so a matching `kid` is the whole answer.
 *
 * WHAT IT DOES NOT DO, following scripts/check-key-transcription.mjs:
 *   - It does not take the seed as an argument. That would put an
 *     egress credential in your shell history and the process list.
 *   - It does not echo the seed, store it, or send it anywhere.
 *   - It does not fetch the directory and announce "match". You read
 *     the published kid yourself and compare it by eye, because a
 *     script that reports on both ends is asking to be trusted at the
 *     one moment you are trying to establish trust.
 */
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import * as ed25519 from "@noble/ed25519";

const HEX_64 = /^[0-9a-f]{64}$/;
const DIRECTORY = "https://scvd.store/.well-known/http-message-signatures-directory";

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

const b64url = (bytes) =>
  Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const rl = createInterface({ input: process.stdin, output: process.stdout });

console.log("\nThe EGRESS key (WBA_SIGNING_KEY), not the artifact key.");
console.log("Nothing here goes over the network.\n");
console.log("Paste or type the candidate's 64 hex characters.\n");

rl.question("seed> ", async (answer) => {
  rl.close();
  const seed = answer.trim().toLowerCase().replace(/\s+/g, "");

  if (!HEX_64.test(seed)) {
    console.error(`\n  NOT A SEED. Expected 64 hex characters (0-9, a-f); got ${seed.length}.`);
    console.error("  Nothing has been checked.\n");
    process.exit(1);
  }

  const publicKey = await ed25519.getPublicKeyAsync(hexToBytes(seed));
  const x = b64url(publicKey);
  // RFC 7638, byte-identical to lib/web-bot-auth.ts's jwkThumbprint and
  // to the runner's: members in lexicographic order, no whitespace.
  const canonical = `{"crv":"Ed25519","kty":"OKP","x":"${x}"}`;
  const kid = b64url(createHash("sha256").update(canonical).digest());

  console.log("\n  This seed derives:\n");
  console.log(`    public key  ${Buffer.from(publicKey).toString("hex")}`);
  console.log(`    x           ${x}`);
  console.log(`    kid         ${kid}\n`);
  console.log("  Compare `kid` and `x`, character by character, against the");
  console.log("  key the store publishes at:\n");
  console.log(`    ${DIRECTORY}\n`);
  console.log("  MATCH     -> this is the live egress key. A walk signed with it");
  console.log("               verifies against the directory an origin fetches.");
  console.log("  NO MATCH  -> this is some other key. Signing a walk with it");
  console.log("               produces a Signature-Agent header pointing at a");
  console.log("               directory that does not list the signing key, which");
  console.log("               is worse than walking unsigned: unsigned is honest,");
  console.log("               this claims a proof that fails. Walk without");
  console.log("               WBA_SIGNING_KEY until the right seed is found.\n");
});
