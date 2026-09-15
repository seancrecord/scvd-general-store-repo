const PRIOR = "Uncertain payment: keep the original payment/key. Use recovery.purchase_id\nand private recovery.status_token with MCP check_purchase, or GET\n`https://scvd.store/api/purchase-status/{purchase_id}` with Authorization: Bearer\n<status_token>. Free after authorization expiry; payment status alone\nis not proof of delivery. Avoid a second authorization while unresolved.\n\n";
import { PURCHASE_RECOVERY_GUIDANCE } from "@/lib/purchase-status-contract";
import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";
import { mcpToolCatalog } from "@/lib/mcp-tools";
const replacements = [
  [
    "Receipt, chain and head checked before payment. Invalid context: retry the same payment",
    "One read at one moment; no polling, no retry, no second look"
  ],
  [
    "Give a Base transaction hash to receive a signed observation of the USDC movement and any attributable authorization limit. A paired EIP-3009 authorization fixes the selected transfer's value: no discretion. An Approval in the same receipt does not establish which allowance funded that transfer. Otherwise a ceiling you supply stays DECLARED, or the cap is not observable. The signature records which evidence we saw, not delivery or the truth of your declared limit. Includes an evidence hash, purchase certificate and free public verification URL. Older approval-based claims need the correction at /corrections.",
    "Was the amount taken within the amount authorized? Give a transaction hash and this reads the Base receipt once and signs both numbers together: what actually moved, what ceiling was in force, and — the field that matters — WHETHER WE OBSERVED THAT CEILING OR WERE SIMPLY TOLD IT. An approval inside the same transaction is on the chain, so we saw it. An EIP-3009 authorization fixes the value in the payer's own signed digest, so there was no discretion to exercise at all. Anything else is your number, labelled as your number, forever. Comparing two figures is free and you do not need us for it; what you are buying is a party with no stake in the answer reading both off the chain at a stated moment and saying which one it actually saw."
  ],
  [
    "Give the Base transaction hash (0x + 64 hex) in the tx_hash query parameter. This product reads Base only; checkout networks do not change the subject chain",
    "Give the Base transaction hash (0x + 64 hex) in the tx_hash query parameter. This desk reads Base only, deliberately: the ceilings it reconciles (EIP-3009 authorizations) are a Base facility"
  ],
  [
    "Approval alone is not an observed spending cap; a paired EIP-3009 value is",
    "Only approvals inside the same transaction are visible; a ceiling granted earlier reads as 'not observed', never as 'absent'"
  ],
  [
    "Receipt, chain and head checked before payment. Invalid context: retry the same payment",
    "One read at one moment; no polling, no retry, no second look"
  ],
  [
    "Give a transaction hash and this assembles, at one moment and under one signature, everything this store already observed about that purchase: a fresh settlement attestation; the reconciliation of movement against an observed fixed value or declared cap (Base); the mandate you cite, its declared cap printed beside the settled amount and never enforced; the door over the seven days around the transaction — corpus rounds, any watch rows, the passport tier at the time — or not_observed, which is an answer about our books; and delivery, if you hold a launch check or this store itself was the seller, otherwise 'delivery not observed by this store' in full weight, because that is the section a dispute usually turns on and we usually do not have it. Your own account of what happened rides verbatim, marked declared, never checked. Every absent section is listed with its reason and counted against us. It says what was observed and what was not; it never says who was wronged. If this store is a party to the purchase, the file says so on its face and still assembles.",
    "Give a transaction hash and this assembles, at one moment and under one signature, everything this store already observed about that purchase: a fresh settlement attestation; the reconciliation of amount taken against ceiling in force (EVM); the mandate you cite, its declared cap printed beside the settled amount and never enforced; the door over the seven days around the transaction — corpus rounds, any watch rows, the passport tier at the time — or not_observed, which is an answer about our books; and delivery, if you hold a launch check or this store itself was the seller, otherwise 'delivery not observed by this store' in full weight, because that is the section a dispute usually turns on and we usually do not have it. Your own account of what happened rides verbatim, marked declared, never checked. Every absent section is listed with its reason and counted against us. It says what was observed and what was not; it never says who was wronged. If this store is a party to the purchase, the file says so on its face and still assembles."
  ],
  [
    "A signed JSON observation of one Base transaction reconciling two numbers — the USDC that moved and an attributable fixed authorization value or declared cap — with cap_source and cap_observed naming where the ceiling came from and whether we saw it ourselves. Verdicts: within_cap, over_cap, no_discretion (EIP-3009, where the value was fixed in the payer's signed digest), cap_not_observable, or no_settlement. Certificate binds the evidence hash; free public record URL. Instant.",
    "A signed JSON observation of one Base transaction reconciling two numbers — the USDC that moved and the ceiling in force — with cap_source and cap_observed naming where the ceiling came from and whether we saw it ourselves. Verdicts: within_cap, over_cap, no_discretion (EIP-3009, where the value was fixed in the payer's signed digest), cap_not_observable, or no_settlement. Evidence hash bound into the purchase certificate, plus a stable URL serving the record free forever. Instant."
  ],
  [
    "The whole observation: the transaction asked about, the USDC movement found, any fixed authorization value or declared ceiling, WHERE THAT CEILING CAME FROM, whether it was observed or merely declared, the headroom between the two, the chain head at read time, and the moment. An EIP-3009 no_discretion reading requires the selected transfer itself to be paired with its authorization; a nonce elsewhere for the same payer is insufficient. Approval co-occurrence is not evidence of allowance consumption. The current reader establishes the reported chain, receipt identity, status and block/head before signing. Older observations can overstate attribution or lack these context checks: consult /corrections before relying on them. cap_observed is a signed field in its own right, because the difference between a ceiling we read off Base and a ceiling somebody told us is the entire weight of this artifact.",
    "The whole observation: the transaction asked about, the USDC movement found, the ceiling in force, WHERE THAT CEILING CAME FROM, whether it was observed or merely declared, the headroom between the two, the chain head at read time, and the moment. An EIP-3009 no_discretion reading requires the selected transfer itself to be paired with its authorization; a nonce elsewhere for the same payer is insufficient. Older observations can overstate that attribution: consult /corrections before relying on it. cap_observed is a signed field in its own right, because the difference between a ceiling we read off Base and a ceiling somebody told us is the entire weight of this artifact."
  ],
  [
    "That a DECLARED ceiling is real. Where cap_observed is false the number came from whoever commissioned the receipt — generally the party it benefits — and the signature covers only that we were told it, never that it is true. It cannot establish allowance consumption from approvals in this or earlier transactions: 'no cap observed' never means no ceiling existed. RPC evidence is not consensus proof. And an over_cap on a declared ceiling is a fact about what the caller said, not about the chain.",
    "That a DECLARED ceiling is real. Where cap_observed is false the number came from whoever commissioned the receipt — generally the party it benefits — and the signature covers only that we were told it, never that it is true. It also cannot see a ceiling granted in an earlier transaction: 'no cap observed' means 'not in this receipt'. And an over_cap on a declared ceiling is a fact about what the caller said, not about the chain."
  ]
];
const normalize = (text: string) => text.replace(/Served: \d{4}-\d{2}-\d{2}/g, "Served: <DATE>").replace(/Last checked by hand: \d{4}-\d{2}-\d{2}/g, "Last checked: <DATE>");
async function digest(text: string) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2,"0")).join(""); }
it("reversing recovery and reconciliation copy reproduces integrated main", async () => {
  const full = await (await SELF.fetch("https://scvd.store/llms-full.txt")).text();
  let reversed = full, changes = 0;
  for (const [current, prior] of replacements) {
    if (reversed.includes(current!)) { changes++; reversed = reversed.replaceAll(current!, prior!); }
    // menuLine deliberately lowercases constraints in the full guide.
    if (reversed.includes(current!.toLowerCase())) { changes++; reversed = reversed.replaceAll(current!.toLowerCase(), prior!.toLowerCase()); }
  }
  expect(changes).toBeGreaterThan(0);
  expect(reversed.split(PURCHASE_RECOVERY_GUIDANCE)).toHaveLength(2);
  reversed = reversed.replace(PURCHASE_RECOVERY_GUIDANCE + "\n\n", PRIOR);
  expect(await digest(normalize(reversed))).toBe("0207f37c249353e6a315ace3d7d6a8ec21d68d8871a6b7e43aa6312ab379dfbe");
  const developers = await (await SELF.fetch("https://scvd.store/developers/llms.txt")).text();
  const descriptions = mcpToolCatalog("https://scvd.store").reduce((sum, tool) => sum + tool.description.length, 0);
  expect(developers.length).toBeLessThan(30000);
  expect(descriptions).toBeLessThan(34000);
  console.log(JSON.stringify({ guide_sha256: await digest(normalize(full)), reversed_sha256: await digest(normalize(reversed)), changes, developer_characters: developers.length, mcp_description_characters: descriptions }));
});
