#!/usr/bin/env node
/**
 * x402 Field Run — 100 endpoints, $10 cap, never over $0.10 per buy.
 * Ledger is the deliverable.
 */

import { ethers } from "ethers";
import fs from "fs";

const privateKey = fs.readFileSync("/home/cv/.secrets/cv-wallet.key", "utf8").trim();
const wallet = new ethers.Wallet(privateKey);
console.log("Field run wallet:", wallet.address);

const LEDGER_PATH = "/home/cv/.openclaw/workspace/research/field-run-2026-08-18/ledger.jsonl";
const SPEND_CAP = 10.00; // $10 total
const PER_BUY_CAP = 0.10; // never over $0.10 per buy

let totalSpent = 0;
const visited = new Set();

function log(entry) {
  fs.appendFileSync(LEDGER_PATH, JSON.stringify(entry) + "\n");
}

async function attemptPurchase(url, method = "GET", body = null) {
  const domain = new URL(url).hostname;
  
  if (visited.has(domain)) {
    return { skipped: true, reason: "already visited", domain };
  }
  visited.add(domain);
  
  const entry = {
    ts: new Date().toISOString(),
    url,
    domain,
    method,
    status: null,
    paid: false,
    amount_usd: 0,
    error: null,
  };
  
  try {
    // Step 1: Hit without payment
    const opts1 = { method, headers: { "User-Agent": "scvd-field-run/1.0" } };
    if (body) {
      opts1.headers["Content-Type"] = "application/json";
      opts1.body = JSON.stringify(body);
    }
    
    const res1 = await fetch(url, opts1);
    entry.status = res1.status;
    
    if (res1.status !== 402) {
      entry.error = `Expected 402, got ${res1.status}`;
      entry.body_preview = (await res1.text()).substring(0, 200);
      log(entry);
      return entry;
    }
    
    // Parse payment requirements
    const paymentRequiredB64 = res1.headers.get("payment-required");
    if (!paymentRequiredB64) {
      entry.error = "No PAYMENT-REQUIRED header";
      log(entry);
      return entry;
    }
    
    const challenge = JSON.parse(Buffer.from(paymentRequiredB64, "base64").toString("utf8"));
    const accept = challenge.accepts?.[0];
    
    if (!accept) {
      entry.error = "No accepts in challenge";
      log(entry);
      return entry;
    }
    
    const amountUsd = Number(accept.amount) / 1e6;
    entry.amount_usd = amountUsd;
    
    // Check caps
    if (amountUsd > PER_BUY_CAP) {
      entry.error = `Amount $${amountUsd} exceeds per-buy cap $${PER_BUY_CAP}`;
      log(entry);
      return entry;
    }
    
    if (totalSpent + amountUsd > SPEND_CAP) {
      entry.error = `Would exceed spend cap ($${totalSpent.toFixed(2)} + $${amountUsd} > $${SPEND_CAP})`;
      log(entry);
      return entry;
    }
    
    // Step 2: Sign payment
    const domain_712 = {
      name: accept.extra?.name || "USD Coin",
      version: accept.extra?.version || "2",
      chainId: 8453,
      verifyingContract: accept.asset,
    };
    
    const types = {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    };
    
    const now = Math.floor(Date.now() / 1000);
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const message = {
      from: wallet.address,
      to: accept.payTo,
      value: accept.amount,
      validAfter: "0",
      validBefore: String(now + (accept.maxTimeoutSeconds || 300)),
      nonce,
    };
    
    const signature = await wallet.signTypedData(domain_712, types, message);
    const paymentPayload = {
      x402Version: 2,
      accepted: accept,
      payload: { signature, authorization: message },
    };
    const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");
    
    // Step 3: Retry with payment
    const opts2 = {
      method,
      headers: {
        "User-Agent": "scvd-field-run/1.0",
        "PAYMENT-SIGNATURE": paymentHeader,
      },
    };
    if (body) {
      opts2.headers["Content-Type"] = "application/json";
      opts2.body = JSON.stringify(body);
    }
    
    const res2 = await fetch(url, opts2);
    entry.status = res2.status;
    entry.paid = res2.status === 200;
    
    if (entry.paid) {
      totalSpent += amountUsd;
      entry.body_preview = (await res2.text()).substring(0, 200);
    } else {
      entry.error = `Payment failed: ${res2.status}`;
      entry.body_preview = (await res2.text()).substring(0, 200);
    }
    
    log(entry);
    return entry;
    
  } catch (e) {
    entry.error = e.message;
    log(entry);
    return entry;
  }
}

async function main() {
  const targets = JSON.parse(fs.readFileSync("/tmp/field-run-targets.json", "utf8"));
  console.log(`Field run: ${targets.length} targets, cap $${SPEND_CAP}`);
  
  const results = [];
  for (const ep of targets) {
    if (totalSpent >= SPEND_CAP) {
      console.log(`Spend cap reached at $${totalSpent.toFixed(2)}`);
      break;
    }
    
    const result = await attemptPurchase(ep.url, ep.method || "GET");
    results.push(result);
    
    if (!result.skipped) {
      console.log(`${result.paid ? "✅" : "❌"} ${ep.service} (${result.domain}) — $${result.amount_usd}`);
    }
    
    // Small delay between purchases
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`\n=== FIELD RUN COMPLETE ===`);
  console.log(`Total spent: $${totalSpent.toFixed(2)}`);
  console.log(`Successful purchases: ${results.filter(r => r.paid).length}`);
  console.log(`Failed: ${results.filter(r => !r.paid && !r.skipped).length}`);
  console.log(`Skipped: ${results.filter(r => r.skipped).length}`);
  console.log(`Ledger: ${LEDGER_PATH}`);
}

main().catch(console.error);
