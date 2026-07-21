#!/usr/bin/env node
// Generates a fresh ed25519 seed for the certificate signing key.
// Usage: npm run keys:generate
// Then:  wrangler secret put SIGNING_KEY   (paste the seed when prompted)
import { randomBytes } from "node:crypto";

const seed = randomBytes(32).toString("hex");
console.log("Fresh ed25519 seed (64 hex chars). Treat it like the till key:\n");
console.log(seed);
console.log("\nSet it with: wrangler secret put SIGNING_KEY");
