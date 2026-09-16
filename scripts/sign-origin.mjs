#!/usr/bin/env node
/**
 * npm run ownership:sign — produce the ownership proof for this
 * origin, and say whether it will actually work before it is pasted
 * anywhere.
 *
 * WHAT IT SIGNS. The bare origin string, `https://scvd.store` — no
 * trailing slash, no path — as an EIP-191 personal_sign. That exact
 * string is what `@agentcash/discovery` recovers against, so a
 * trailing slash produces a valid signature of the WRONG message and
 * fails silently at the reader. Signing is done here rather than left
 * to a hand-typed `cast` invocation for that one reason.
 *
 * THE KEY COMES FROM THE ENVIRONMENT, NEVER FROM ARGV, because argv
 * is readable by any process on the machine (`ps`) and lands in shell
 * history. It is read, used, and never printed or written anywhere.
 * Nothing here is transmitted: the signature is computed locally and
 * the only network call is an optional read of the store's own public
 * openapi.json to check which wallet is currently being paid.
 *
 * THE CHECK THAT MAKES THIS WORTH RUNNING. A proof only counts if it
 * is signed by a payTo address the store CURRENTLY advertises. This
 * fetches the live document and says, before you paste anything,
 * whether the key you used is one of them. Signing with the wrong
 * wallet is otherwise indistinguishable from success until x402scan
 * quietly declines to verify it.
 *
 * Usage, from the repo root:
 *
 *   ORIGIN_SIGNING_KEY=0x... npm run ownership:sign
 *   ORIGIN_SIGNING_KEY=0x... npm run ownership:sign -- --base=https://scvd.store
 *   ORIGIN_SIGNING_KEY=0x... npm run ownership:sign -- --offline
 */
import { privateKeyToAccount } from "viem/accounts";
import { recoverMessageAddress } from "viem";

const args = process.argv.slice(2);
const value = (name, fallback) =>
  args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;

const base = value("base", "https://scvd.store").replace(/\/$/, "");
const origin = new URL(base).origin;

const raw = process.env.ORIGIN_SIGNING_KEY?.trim();
if (!raw) {
  console.error("ownership:sign — set ORIGIN_SIGNING_KEY to the payTo wallet's private key.\n");
  console.error("  ORIGIN_SIGNING_KEY=0x... npm run ownership:sign\n");
  console.error("Never pass a key as an argument: argv is world-readable on most systems");
  console.error("and is kept in shell history. If the payTo wallet is a hardware or");
  console.error("custodial wallet whose key you cannot export, do not try — sign the");
  console.error("string with that wallet's own signing UI instead and skip this script.");
  process.exit(1);
}

const key = raw.startsWith("0x") ? raw : `0x${raw}`;
let account;
try {
  account = privateKeyToAccount(key);
} catch {
  console.error("ownership:sign — that does not parse as a secp256k1 private key (32 bytes, 64 hex chars).");
  process.exit(1);
}

const signature = await account.signMessage({ message: origin });

// Verify our own output the way the reader will, before showing it.
const recovered = await recoverMessageAddress({ message: origin, signature });
if (recovered.toLowerCase() !== account.address.toLowerCase()) {
  console.error("ownership:sign — the signature did not recover to its own signer. Refusing to print it.");
  process.exit(1);
}

let advertised = null;
if (!args.includes("--offline")) {
  try {
    const response = await fetch(`${base}/openapi.json`, { headers: { accept: "application/json" } });
    if (response.ok) {
      const doc = await response.json();
      const payTo = new Set();
      for (const item of Object.values(doc.paths ?? {})) {
        for (const operation of Object.values(item ?? {})) {
          for (const accept of operation?.["x-payment-info"]?.accepts ?? []) {
            if (accept?.payTo) payTo.add(accept.payTo);
          }
        }
      }
      advertised = [...payTo];
    }
  } catch {
    // Offline is not a failure: the signature is still correct.
  }
}

console.log(`\n  message signed   ${origin}`);
console.log(`  signed by        ${account.address}`);
console.log(`\n  ${signature}\n`);

if (advertised === null) {
  console.log("  Could not read the live document to check the wallet. Confirm by hand");
  console.log(`  that ${account.address} is a payTo address in /openapi.json.`);
} else if (advertised.some((a) => a.toLowerCase() === account.address.toLowerCase())) {
  console.log(`  This wallet IS advertised as a payTo at ${origin}. The proof will verify.`);
  console.log("  Put the line above in the ORIGIN_OWNERSHIP_PROOFS secret, then run");
  console.log("  `npm run ownership:check` once it is deployed.");
} else {
  console.log(`  WARNING: ${account.address} is NOT a payTo address at ${origin}.`);
  console.log("  A proof by a wallet the store does not ask to be paid at verifies");
  console.log("  nothing. The addresses currently advertised are:");
  for (const address of advertised) console.log(`    ${address}`);
  process.exitCode = 1;
}
