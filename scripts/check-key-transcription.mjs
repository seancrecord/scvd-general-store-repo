#!/usr/bin/env node
/**
 * CHECK A PAPER TRANSCRIPTION OF THE SIGNING KEY.
 *
 * Usage:  npm run keys:check
 *
 * Type the seed IN FROM THE PAPER when prompted — do not paste it, do
 * not copy it off the screen you copied the paper from. The entire
 * point is to catch a transcription error, and a paste tests nothing
 * but the clipboard. Sixty-four hex characters copied by hand at 2am
 * is exactly the operation that produces one wrong digit, and a wrong
 * digit is not discovered until the day the backup is the only copy
 * left.
 *
 * WHAT IT DOES: derives the ed25519 public key from the seed you type
 * and prints it, so you can compare it against the public key the live
 * store publishes at /.well-known/scvd-signing-key. Match means the
 * paper is good. Anything else means the paper is wrong and the digital
 * copy must not be destroyed yet.
 *
 * WHAT IT DOES NOT DO, deliberately:
 *   - It does not take the seed as a command-line argument. That would
 *     put the till key in your shell history, in the process list, and
 *     in any terminal-recording tool you have running.
 *   - It does not echo the seed back, write it anywhere, or send it
 *     anywhere. Nothing here touches the network; that is why it can be
 *     run with the wifi off, which is how it should be run.
 *   - It does not fetch the published key for you. Read that one with
 *     your own eyes from the live site, on a different device if you
 *     like, and compare by hand. A script that fetches both ends and
 *     announces "match" is asking you to trust the script at the one
 *     moment you should not be trusting anything.
 */
import { createInterface } from "node:readline";
import * as ed25519 from "@noble/ed25519";

const HEX_64 = /^[0-9a-f]{64}$/;

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

const rl = createInterface({ input: process.stdin, output: process.stdout });

console.log("\nTurn the wifi off first. Nothing here needs it.\n");
console.log("Type the 64 hex characters IN FROM THE PAPER. Do not paste.\n");

rl.question("seed> ", async (answer) => {
  rl.close();
  const seed = answer.trim().toLowerCase().replace(/\s+/g, "");

  if (!HEX_64.test(seed)) {
    console.error(
      `\n  NOT A SEED. Expected 64 hex characters (0-9, a-f); got ${seed.length}.`,
    );
    console.error("  Nothing has been checked. The paper may still be fine —");
    console.error("  count the characters and try again.\n");
    process.exit(1);
  }

  const publicKey = Buffer.from(
    await ed25519.getPublicKeyAsync(hexToBytes(seed)),
  ).toString("hex");

  console.log("\n  This paper derives the public key:\n");
  console.log(`    ${publicKey}\n`);
  console.log("  Compare it, character by character, against `public_key` at:");
  console.log("    https://scvd.store/.well-known/scvd-signing-key\n");
  console.log("  MATCH      -> the paper is good. Now destroy the digital copies.");
  console.log("  NO MATCH   -> the paper is wrong. Do NOT destroy anything.");
  console.log("               Rewrite the paper from the digital copy and run");
  console.log("               this again. A backup nobody has checked is not a");
  console.log("               backup, it is a note that resembles one.\n");
});
