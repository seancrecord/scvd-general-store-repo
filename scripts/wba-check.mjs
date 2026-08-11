#!/usr/bin/env node
/**
 * VERIFY THE STORE'S WEB BOT AUTH GRAMMAR AGAINST SOMEBODY ELSE'S
 * VERIFIER — Cloudflare's public debug endpoint, which checks RFC
 * 9421 signatures the same way their inbound verification does.
 *
 *   node scripts/wba-check.mjs                 # sign with the RFC 9421
 *                                              # test key, expect verified
 *   node scripts/wba-check.mjs --directory     # also fetch the deployed
 *                                              # directory and verify its
 *                                              # proof-of-possession
 *
 * WHY A SCRIPT AND NOT A SPEC. The vitest suite proves our signatures
 * verify against our published key (test/web-bot-auth.spec.ts, from
 * the wire bytes, with independent crypto). What it cannot prove is
 * that a THIRD PARTY's reading of the drafts matches ours — component
 * ordering, sf-string quoting, base construction. This script asks
 * the one verifier that matters in practice. Keeper-run, like every
 * other checker in this directory; it changes nothing anywhere.
 *
 * THE SIGNING LINES BELOW DUPLICATE src/lib/web-bot-auth.ts ON
 * PURPOSE, and the drift risk is accepted with eyes open: a checker
 * that imported the code under test would inherit its bugs. If this
 * script verifies and production traffic does not, the difference IS
 * the finding.
 *
 * The default key is the RFC 9421 Appendix B Ed25519 TEST key —
 * published in the RFC, known to Cloudflare's debug endpoint, secret
 * to nobody. The store's real egress key never touches this script.
 */
import * as ed25519 from "@noble/ed25519";

/** RFC 9421 B.1.4 test-key-ed25519 (public by definition). */
const RFC9421_TEST_SEED =
  "9f8362f87a484a954e6e740c5b4c0e84229139a20aa8ab56ff66586f6a7d29c5";

const DEBUG_ENDPOINT =
  "https://http-message-signatures-example.research.cloudflare.com/";
const DIRECTORY_URL =
  "https://scvd.store/.well-known/http-message-signatures-directory";

const b64 = (bytes) => Buffer.from(bytes).toString("base64");
const b64url = (bytes) => Buffer.from(bytes).toString("base64url");

async function jwkThumbprint(x) {
  const canonical = `{"crv":"Ed25519","kty":"OKP","x":"${x}"}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return b64url(new Uint8Array(digest));
}

async function signRequest(seedHex, targetUrl) {
  const pub = await ed25519.getPublicKeyAsync(seedHex);
  const keyid = await jwkThumbprint(b64url(pub));
  const created = Math.floor(Date.now() / 1000);
  const expires = created + 300;
  const nonce = b64(crypto.getRandomValues(new Uint8Array(32)));
  const authority = new URL(targetUrl).host;
  const params = `("@authority");created=${created};expires=${expires};keyid="${keyid}";alg="ed25519";nonce="${nonce}";tag="web-bot-auth"`;
  const base = `"@authority": ${authority}\n"@signature-params": ${params}`;
  const signature = await ed25519.signAsync(
    new TextEncoder().encode(base),
    seedHex,
  );
  return {
    "Signature-Input": `sig1=${params}`,
    Signature: `sig1=:${b64(signature)}:`,
  };
}

async function checkAgainstCloudflare() {
  const headers = await signRequest(RFC9421_TEST_SEED, DEBUG_ENDPOINT);
  const response = await fetch(DEBUG_ENDPOINT, {
    headers: { ...headers, "User-Agent": "scvd-general-store/1.0 (+https://scvd.store)" },
  });
  const body = await response.text();
  // Their page's exact sentence, observed 2026-08-11: "You successfully
  // authenticated as owning the test public key". Matched loosely —
  // "successfully authenticated" — because quoting somebody else's
  // string verbatim is how the publish script's ✔-line advice went
  // stale; if they reword it entirely, the fallback below prints the
  // page and a human reads it.
  const verified = /successfully authenticated/i.test(body);
  console.log(`Cloudflare debug endpoint answered ${response.status}.`);
  if (verified) {
    console.log("VERIFIED — their reading of the drafts matches ours.");
    return true;
  }
  console.log(
    "NOT VERIFIED, or the page's wording changed. The relevant fragment:\n",
  );
  const fragment = body.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? body;
  console.log(fragment.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 600));
  return false;
}

async function checkDirectory() {
  const response = await fetch(DIRECTORY_URL, {
    headers: { "User-Agent": "scvd-general-store/1.0 (+https://scvd.store)" },
  });
  console.log(`\nDirectory ${DIRECTORY_URL} answered ${response.status}.`);
  if (response.status === 404) {
    console.log(
      "That is the honest not-configured answer: WBA_SIGNING_KEY is not set\n" +
        "in production yet. Set it (npm run keys:generate, then\n" +
        "`wrangler secret put WBA_SIGNING_KEY`) and re-run.",
    );
    return false;
  }
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.json();
  const jwk = body.keys?.[0];
  console.log(`content-type: ${contentType}`);
  console.log(`key: ${JSON.stringify(jwk)}`);
  const input = response.headers.get("signature-input") ?? "";
  const signature = response.headers.get("signature") ?? "";
  const params = input.replace(/^sig1=/, "");
  const base = `"@authority": ${new URL(DIRECTORY_URL).host}\n"@signature-params": ${params}`;
  const sigBytes = Buffer.from(
    signature.replace(/^sig1=:/, "").replace(/:$/, ""),
    "base64",
  );
  const verified = await ed25519.verifyAsync(
    sigBytes,
    new TextEncoder().encode(base),
    Buffer.from(jwk.x, "base64url"),
  );
  console.log(
    verified
      ? "Directory proof-of-possession VERIFIED against its own key."
      : "Directory signature DID NOT VERIFY — that is a finding, report it.",
  );
  return verified;
}

const wantDirectory = process.argv.includes("--directory");
const ok = await checkAgainstCloudflare();
const dirOk = wantDirectory ? await checkDirectory() : true;
process.exit(ok && dirOk ? 0 : 1);
