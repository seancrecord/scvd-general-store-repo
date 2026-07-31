#!/usr/bin/env node
// Generates a fresh ed25519 seed for the certificate signing key.
// Usage: npm run keys:generate
// Then:  wrangler secret put SIGNING_KEY   (paste the seed when prompted)
//
// THE WARNING BELOW EXISTS BECAUSE THE NAME OF THIS COMMAND LIES BY
// OMISSION, and it cost a real hour on 2026-07-31. The keeper was
// working through the paper-key ceremony, needed the store's existing
// seed, saw a command called `keys:generate` in a repo that has
// exactly one key, and reasonably read it as "the key command." He ran
// it and wrote down what it printed. What it printed was 32 fresh
// random bytes with no connection to the live store.
//
// Nothing can display the existing seed — Cloudflare Worker secrets
// are write-only — so there is no sibling command this should point at
// instead. The only honest thing to do is say what this one IS, before
// the number, where somebody about to copy it down will read it.
//
// A DANGEROUS OUTPUT THAT LOOKS EXACTLY LIKE A SAFE ONE gets a guard
// at the point of output, not in a document beside it. Same reason the
// 402 carries the maker's mark rather than the receipt.
import { randomBytes } from "node:crypto";

const seed = randomBytes(32).toString("hex");

console.log(`
  ┌────────────────────────────────────────────────────────────────┐
  │  THIS IS A NEW KEY. IT IS NOT YOUR EXISTING ONE.               │
  │                                                                │
  │  This command invents 32 random bytes every time it runs. It   │
  │  cannot show you the key the store is signing with — nothing   │
  │  can, because Cloudflare Worker secrets are write-only.        │
  │                                                                │
  │  If you came here to BACK UP the live key, this is the wrong   │
  │  command and the number below is not it. See THE_PAPER_KEY.md. │
  │                                                                │
  │  Putting this into wrangler REPLACES the store's signing key   │
  │  and every artifact ever issued stops verifying. Only do that  │
  │  if you are deliberately setting up a new store or performing  │
  │  a handover you have already decided on.                       │
  └────────────────────────────────────────────────────────────────┘
`);
console.log("Fresh ed25519 seed (64 hex chars). Treat it like the till key:\n");
console.log(seed);
console.log("\nSet it with: wrangler secret put SIGNING_KEY");
console.log("(Read the box above first. It overwrites.)");
