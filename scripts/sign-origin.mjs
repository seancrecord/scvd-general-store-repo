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
import { signAsync, getPublicKeyAsync, verifyAsync } from "@noble/ed25519";

const args = process.argv.slice(2);
const value = (name, fallback) =>
  args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;

const base = value("base", "https://scvd.store").replace(/\/$/, "");
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
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (const char of text) { if (char !== B58[0]) break; bytes.push(0); }
  return Uint8Array.from(bytes.reverse());
}
function encodeBase58(bytes) {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let out = "";
  for (const byte of bytes) { if (byte !== 0) break; out += B58[0]; }
  return out + digits.reverse().map((d) => B58[d]).join("");
}

/**
 * THE SOLANA SEED, FROM THE TWO SHAPES A KEEPER ACTUALLY HAS.
 *
 * A wallet app (Phantom, Solflare) exports 64 base58 bytes — the
 * ed25519 seed followed by its public key. `solana-keygen` writes the
 * same 64 bytes as a JSON array. Either way the SEED is the first 32,
 * which is what ed25519 signs with; a bare 32-byte value is already a
 * seed. Anything else is not a key we can use, and saying so beats
 * signing with the wrong half and producing a valid signature by a
 * wallet nobody is paid at.
 */
function solanaSeed(text) {
  let bytes = null;
  if (text.startsWith("[")) {
    try { bytes = Uint8Array.from(JSON.parse(text)); } catch { return null; }
  } else {
    bytes = decodeBase58(text);
  }
  if (!bytes) return null;
  if (bytes.length === 64) return bytes.slice(0, 32);
  if (bytes.length === 32) return bytes;
  return null;
}

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

/*
 * SOLANA FIRST, because an EVM key is unambiguous (64 hex chars) and a
 * Solana export is not: base58 of the right length, or a JSON array.
 * A wrong guess here signs with the wrong curve and fails at the
 * reader rather than here, which is the failure this script exists to
 * prevent.
 */
const seed = /^(0x)?[0-9a-fA-F]{64}$/.test(raw) ? null : solanaSeed(raw);
if (seed) {
  const publicKey = await getPublicKeyAsync(seed);
  const address = encodeBase58(publicKey);
  const message = new TextEncoder().encode(origin);
  const signatureBytes = await signAsync(message, seed);

  // Verify our own output the way the reader will, before showing it.
  if (!(await verifyAsync(signatureBytes, message, publicKey))) {
    console.error("ownership:sign — the signature did not verify against its own signer. Refusing to print it.");
    process.exit(1);
  }
  const signature = encodeBase58(signatureBytes);

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
    } catch { /* offline is not a failure */ }
  }

  console.log(`\n  message signed   ${origin}`);
  console.log(`  chain            solana (ed25519 over the raw message bytes)`);
  console.log(`  signed by        ${address}`);
  console.log(`\n  ${signature}\n`);

  if (advertised === null) {
    console.log("  Could not read the live document to check the wallet. Confirm by hand");
    console.log(`  that ${address} is a payTo address in /openapi.json.`);
  } else if (advertised.includes(address)) {
    console.log(`  This wallet IS advertised as a payTo at ${origin}. The proof will verify.`);
    console.log("  APPEND the line above to ORIGIN_OWNERSHIP_PROOFS, separated from the");
    console.log("  existing proof by a comma or newline — do not replace it.");
  } else {
    console.log(`  WARNING: ${address} is NOT a payTo address at ${origin}.`);
    console.log("  Base58 is case-sensitive; compare exactly. Advertised:");
    for (const a of advertised) console.log(`    ${a}`);
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
}

const key = raw.startsWith("0x") ? raw : `0x${raw}`;
let account;
try {
  account = privateKeyToAccount(key);
} catch {
  console.error("ownership:sign — that is neither a secp256k1 key (64 hex chars) nor a");
  console.error("Solana key (base58 or a JSON byte array, 32 or 64 bytes).");
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
