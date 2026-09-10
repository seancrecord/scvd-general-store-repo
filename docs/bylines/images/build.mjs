#!/usr/bin/env node
/**
 * Emits the byline images as self-contained HTML (inline SVG) into src/,
 * then render.sh screenshots each with the bundled Chromium into png/.
 *
 *   node docs/bylines/images/build.mjs && sh docs/bylines/images/render.sh
 *
 * Every number here is the one the draft states; the drafts cite the
 * repo files the numbers came from. Palette validated 2026-09-10 with the
 * dataviz validator on surface #0b0a12: series/emphasis #33a58c, status
 * good #33a58c / critical #d95926, de-emphasis #372c44. Bright brand teal
 * #5de6c8 is chrome only (rules, badges), never a data mark.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "src");
mkdirSync(OUT, { recursive: true });

const W = 1600, H = 900, PAD = 96;
const C = {
  surface: "#0b0a12", card: "#16121f", line: "#372c44",
  ink: "#f4f1f7", ink2: "#cfc4d6", muted: "#857a91",
  series: "#33a58c", good: "#33a58c", bad: "#d95926",
  chrome: "#5de6c8",
};
const FONT = `ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const page = (title, svgBody, h = H) => `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<style>html,body{margin:0;background:${C.surface}}svg{display:block}text{font-family:${FONT}}</style>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}">
<rect width="${W}" height="${h}" fill="${C.surface}"/>
${svgBody}
</svg>`;

const t = (x, y, s, { size = 26, fill = C.ink2, weight = 400, anchor = "start", op = 1 } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}" opacity="${op}">${esc(s)}</text>`;
const rule = (y, x1 = PAD, x2 = W - PAD, stroke = C.line) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${stroke}" stroke-width="1"/>`;
const kicker = (s) => t(PAD, PAD, s.toUpperCase(), { size: 20, fill: C.muted });
const title = (s, y = PAD + 52) => t(PAD, y, s, { size: 40, fill: C.ink, weight: 700 });
const foot = (s, h = H) => t(PAD, h - PAD + 24, s, { size: 20, fill: C.muted });
const card = (x, y, w, h, r = 12) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${C.card}" stroke="${C.line}"/>`;
/** Bar with a 4px-rounded data end and a square baseline; <= 24px thick. */
const hbar = (x, y, w, fill, th = 22) => w <= 0 ? "" :
  `<path d="M${x},${y} h${Math.max(w - 4, 0)} a4,4 0 0 1 4,4 v${th - 8} a4,4 0 0 1 -4,4 h-${Math.max(w - 4, 0)} z" fill="${fill}"/>`;
const badge = (x, y, s, fill, ink = C.surface) => {
  const w = s.length * 14.5 + 28;
  return `<rect x="${x}" y="${y - 24}" width="${w}" height="34" rx="6" fill="${fill}"/>` +
    t(x + w / 2, y, s, { size: 20, fill: ink, weight: 700, anchor: "middle" });
};
const arrow = (x1, y1, x2, y2, stroke = C.muted) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="2" marker-end="url(#ah)"/>`;
const DEFS = `<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${C.muted}"/></marker></defs>`;

const files = {};

/* ───────────────── 39 WAYS ───────────────── */

files["39-featured"] = page("The four-character purchase", `
${kicker("BUY-001 · severity 1")}
${title("The four-character purchase")}
${card(PAD, 220, W - 2 * PAD, 480)}
${t(PAD + 40, 290, "POST /api/buy/the_confession", { size: 28, fill: C.ink })}
${t(PAD + 40, 350, "confession:", { size: 28 })}${t(PAD + 260, 350, '"\\u0000"', { size: 28, fill: C.ink })}
${t(PAD + 420, 350, "← present · a string · not empty · passes", { size: 22, fill: C.muted })}
${rule(390, PAD + 40, W - PAD - 40)}
${t(PAD + 40, 450, "402  →  signed  →", { size: 28 })}
${badge(PAD + 380, 450, "SETTLED  $0.005  base", C.good)}
${rule(490, PAD + 40, W - PAD - 40)}
${t(PAD + 40, 550, "artifact  cert_…", { size: 28 })}
${t(PAD + 40, 610, "confession:", { size: 28 })}${t(PAD + 260, 610, '""', { size: 28, fill: C.ink })}
${t(PAD + 420, 610, "← the null byte collapsed in fulfillment", { size: 22, fill: C.muted })}
${t(PAD + 40, 665, "signature: ed25519 ✓   receipt: valid", { size: 22, fill: C.muted })}
${foot("24 settlements · HTTP and MCP · three rails · every receipt valid, every good empty")}
`);

{
  const rows = [["SEV-1", 6], ["P1", 24], ["P2", 9]];
  const max = 24, x0 = PAD + 120, bw = W - PAD - x0 - 120;
  let y = 250; let body = "";
  for (const [k, v] of rows) {
    const w = (v / max) * bw;
    body += t(x0 - 24, y + 17, k, { size: 24, anchor: "end", fill: C.ink2 });
    body += hbar(x0, y, w, C.series);
    body += t(x0 + w + 16, y + 17, String(v), { size: 24, fill: C.ink });
    y += 64;
  }
  files["39-severity"] = page("39 findings by severity", `
${kicker("Buyer audit · 2026-09-05 to 09-08 · five rails")}
${title("39 findings")}
${body}
${rule(470)}
${t(PAD, 540, "Payment-layer defects", { size: 24, fill: C.muted })}
${t(PAD, 660, "0", { size: 120, fill: C.ink, weight: 700 })}
${t(PAD + 110, 660, "signatures verified · replays caught · amounts exact, every time", { size: 22, fill: C.muted })}
${foot("53 of 81 repair steps committed · 28 open · three of six SEV-1 among them")}
`);
}

files["39-receipts"] = page("Buy a correction, get the mistake back", `
${DEFS}
${kicker("BUY-005 · severity 1 · six reproductions")}
${title("Buy a correction, get the mistake back")}
${card(PAD, 220, 640, 420)}
${t(PAD + 32, 270, "purchase 1", { size: 20, fill: C.muted })}
${t(PAD + 32, 330, "transaction  0x4c…e1", { size: 26 })}
${t(PAD + 32, 380, "claim", { size: 26 })}${t(PAD + 160, 380, "A", { size: 26, fill: C.ink, weight: 700 })}
${badge(PAD + 32, 450, "SETTLED", C.good)}
${t(PAD + 32, 520, "artifact says:", { size: 22, fill: C.muted })}${t(PAD + 260, 520, "A", { size: 26, fill: C.ink })}
${t(PAD + 32, 600, "correct", { size: 22, fill: C.muted })}
${card(W - PAD - 640, 220, 640, 420)}
${t(W - PAD - 608, 270, "purchase 2 · new payment · new key", { size: 20, fill: C.muted })}
${t(W - PAD - 608, 330, "transaction  0x4c…e1", { size: 26 })}
${t(W - PAD - 608, 380, "claim", { size: 26 })}${t(W - PAD - 480, 380, "B", { size: 26, fill: C.ink, weight: 700 })}
${badge(W - PAD - 608, 450, "SETTLED", C.good)}
${t(W - PAD - 608, 520, "artifact says:", { size: 22, fill: C.muted })}
<rect x="${W - PAD - 620 + 260 - 14}" y="${520 - 30}" width="46" height="44" rx="6" fill="none" stroke="${C.bad}" stroke-width="3"/>
${t(W - PAD - 608 + 260, 520, "A", { size: 26, fill: C.ink })}
${t(W - PAD - 608, 600, "cache key {transaction, mandate}; claim absent", { size: 20, fill: C.muted })}
${arrow(PAD + 660, 430, W - PAD - 660, 430)}
${foot("Every input that changes the deliverable belongs in the reuse identity, or the request is refused before payment.")}
`);

files["39-states"] = page("No charge, after the charge", `
${DEFS}
${kicker("BUY-017 · severity 1 · lost settlement acknowledgement")}
${title('"No charge," after the charge')}
${t(PAD, 250, "BEFORE", { size: 20, fill: C.muted })}
${card(PAD, 270, 400, 110)}${t(PAD + 200, 335, "refused", { size: 28, anchor: "middle", fill: C.ink })}
${card(PAD + 504, 270, 400, 110)}${t(PAD + 704, 320, "unknown", { size: 28, anchor: "middle", fill: C.ink })}
${t(PAD + 704, 355, "money moved · no ack", { size: 18, anchor: "middle", fill: C.muted })}
${card(PAD + 1008, 270, 400, 110)}${t(PAD + 1208, 335, "settled", { size: 28, anchor: "middle", fill: C.ink })}
${arrow(PAD + 504, 325, PAD + 410, 325, C.bad)}
${t(PAD + 452, 415, '"No charge"', { size: 22, anchor: "middle", fill: C.ink })}
${t(PAD + 452, 448, "false, and the store had no way to know it", { size: 18, anchor: "middle", fill: C.muted })}
${rule(490)}
${t(PAD, 545, "AFTER", { size: 20, fill: C.muted })}
${card(PAD, 565, 400, 110)}${t(PAD + 200, 630, "refused", { size: 28, anchor: "middle", fill: C.ink })}
<rect x="${PAD + 504}" y="565" width="400" height="110" rx="12" fill="${C.card}" stroke="${C.series}" stroke-width="3"/>
${t(PAD + 704, 615, "unknown", { size: 28, anchor: "middle", fill: C.ink })}
${t(PAD + 704, 650, "charged: null · reconciliation ref", { size: 18, anchor: "middle", fill: C.muted })}
${card(PAD + 1008, 565, 400, 110)}${t(PAD + 1208, 630, "settled", { size: 28, anchor: "middle", fill: C.ink })}
${foot("A settlement you cannot confirm is not a settlement that did not happen. Delivery after reconciliation is still open.")}
`);

/* ───────────────── A2A ───────────────── */

files["a2a-featured"] = page("Same endpoint, same minute", `
${kicker("2026-09-06 · scvd.store/a2a")}
${title("Same endpoint. Same minute.")}
${card(PAD, 220, 660, 460)}
${t(PAD + 32, 268, "$ npx @a2a-compliance/cli@0.3.3 run …", { size: 20, fill: C.muted })}
${t(PAD + 32, 330, "exit 0", { size: 30, fill: C.ink, weight: 700 })}
${t(PAD + 32, 385, "MANDATORY", { size: 26, fill: C.ink })}
${t(PAD + 32, 440, "16 pass / 20 checks", { size: 26, fill: C.ink })}
${t(PAD + 32, 495, "0 fail · 3 warn · 1 skip", { size: 26, fill: C.ink })}
${badge(PAD + 32, 590, "card: FULL_FEATURED 6/6", C.good)}
${t(PAD + 32, 650, "the checker's reading", { size: 20, fill: C.muted })}
${card(W - PAD - 660, 220, 660, 460)}
${t(W - PAD - 628, 268, "official 0.3.0 schema, same Task response", { size: 20, fill: C.muted })}
${t(W - PAD - 628, 330, '"kind": "task",', { size: 24, fill: C.ink })}
${t(W - PAD - 628, 375, '"id": "b1f0…",', { size: 24, fill: C.ink })}
<rect x="${W - PAD - 636}" y="392" width="420" height="44" rx="6" fill="none" stroke="${C.bad}" stroke-width="3"/>
${t(W - PAD - 628, 420, '"contextId":  (missing)', { size: 24, fill: C.ink })}
${t(W - PAD - 628, 465, '"status": { "state": "completed" }', { size: 24, fill: C.ink })}
${t(W - PAD - 628, 540, "must have required property 'contextId'", { size: 22, fill: C.ink })}
${t(W - PAD - 628, 580, "tasks/get on that id → -32001", { size: 22, fill: C.ink })}
${t(W - PAD - 628, 620, "parts: [null] → HTTP 500", { size: 22, fill: C.ink })}
${t(W - PAD - 628, 650, "the spec's reading", { size: 20, fill: C.muted })}
${foot("One green build, three schema violations. The checker's Task schema has contextId optional; the spec does not.")}
`);

{
  const rows = [
    ["version string", ["accepts only `0.3` and `1.0`;", "warns on a valid `0.3.0`"], ["`0.3.0` is the published version"]],
    ["method naming", ["`tasks/send` is 0.3;", "`message/send` is 1.0"], ["0.3.0 specifies `message/send`"]],
    ["MUST warning", ["non-failing; exit 0"], ["a MUST is a requirement"]],
  ];
  let y = 300, body = "";
  body += t(PAD + 340, 250, "what the CLI does", { size: 20, fill: C.muted });
  body += t(PAD + 900, 250, "what 0.3.0 says", { size: 20, fill: C.muted });
  body += rule(270);
  for (const [k, a, b] of rows) {
    body += t(PAD, y, k, { size: 24, fill: C.ink, weight: 700 });
    a.forEach((line, i) => { body += t(PAD + 340, y + i * 32, line, { size: 22, fill: C.ink2 }); });
    b.forEach((line, i) => { body += t(PAD + 900, y + i * 32, line, { size: 22, fill: C.ink2 }); });
    body += rule(y + 40 + (Math.max(a.length, b.length) - 1) * 32);
    y += 120;
  }
  files["a2a-table"] = page("The checker vs the spec", `
${kicker("@a2a-compliance/cli@0.3.3 · installed package source, not the README")}
${title("The checker vs. the spec")}
${body}
${foot("Pin the executable, not the README. Exit 0 is not a gate while a MUST warning is non-failing.")}
`);
}

/* ───────────────── CROSS-RAIL ───────────────── */

files["cross-featured"] = page("The signature covers the transaction, not the neighbor", `
${DEFS}
${kicker("BUY-018 · P1 · cross-rail payer identity")}
${title("One envelope, two fields, one signature")}
<rect x="${PAD}" y="220" width="820" height="420" rx="14" fill="${C.card}" stroke="${C.line}" stroke-dasharray="8 6"/>
${t(PAD + 32, 262, "x402 payment envelope", { size: 20, fill: C.muted })}
<rect x="${PAD + 32}" y="290" width="756" height="130" rx="10" fill="${C.surface}" stroke="${C.good}" stroke-width="3"/>
${t(PAD + 56, 335, "solana transaction", { size: 26, fill: C.ink })}
${t(PAD + 56, 380, "TransferChecked · correct mint · correct amount · ed25519", { size: 20, fill: C.ink2 })}
${badge(PAD + 620, 335, "VERIFIED", C.good)}
<rect x="${PAD + 32}" y="450" width="756" height="150" rx="10" fill="${C.surface}" stroke="${C.muted}" stroke-dasharray="6 5"/>
${t(PAD + 56, 495, "payload.authorization.from", { size: 26, fill: C.ink })}
${t(PAD + 56, 540, "0xBUYER_A…  (EVM-shaped · attached by the sender)", { size: 20, fill: C.ink2 })}
${t(PAD + 56, 578, "not covered by the signature", { size: 20, fill: C.muted })}
${arrow(PAD + 790, 525, W - PAD - 420, 525)}
${card(W - PAD - 400, 440, 400, 170)}
${t(W - PAD - 200, 500, "cache lookup", { size: 22, anchor: "middle", fill: C.muted })}
${t(W - PAD - 200, 545, "→ Buyer A's certificate", { size: 24, anchor: "middle", fill: C.ink, weight: 700 })}
${t(W - PAD - 200, 585, "Solana payment never settled", { size: 18, anchor: "middle", fill: C.muted })}
${foot("A signature authenticates the transaction it covers. It does not authenticate the fields sitting next to it.")}
`);

files["cross-sequence"] = page("The attack in three steps", `
${DEFS}
${kicker("BUY-018 · reproduced on HTTP and MCP against Base and Polygon buyers")}
${title("The attack, in three steps")}
${["Buyer A", "Store", "Attacker"].map((l, i) => t(PAD + 180 + i * 560, 250, l, { size: 24, anchor: "middle", fill: C.ink, weight: 700 })).join("")}
${[0, 1, 2].map((i) => `<line x1="${PAD + 180 + i * 560}" y1="270" x2="${PAD + 180 + i * 560}" y2="720" stroke="${C.line}" stroke-width="1"/>`).join("")}
${arrow(PAD + 180, 340, PAD + 740 - 8, 340)}
${t(PAD + 460, 320, "1 · pays on Base, suggested key", { size: 20, anchor: "middle", fill: C.ink2 })}
${card(PAD + 640, 360, 200, 44)}${t(PAD + 740, 389, "cert_A cached", { size: 18, anchor: "middle", fill: C.ink })}
${arrow(PAD + 1300, 480, PAD + 740 + 8, 480)}
${t(PAD + 1020, 460, "2 · valid Solana tx + unsigned from: BUYER_A", { size: 20, anchor: "middle", fill: C.ink2 })}
${arrow(PAD + 740, 600, PAD + 1300 - 8, 600)}
${t(PAD + 1020, 580, "3 · here is cert_A", { size: 20, anchor: "middle", fill: C.ink2 })}
${badge(PAD + 1040, 660, "nothing settled", C.bad, C.ink)}
${foot("Four victim cases failed before the fix. The repair reads payer identity only from the rail that was verified.")}
`);

files["cross-cert"] = page("Signed, valid, meaningless", `
${kicker("BUY-019 · P1 · a valid signature over a meaningless fact")}
${title("Signed. Valid. Meaningless.")}
${card(PAD, 220, W - 2 * PAD, 460)}
${badge(W - PAD - 220, 280, "VALID ✓", C.good)}
${t(PAD + 40, 285, "certificate", { size: 22, fill: C.muted })}
${t(PAD + 40, 350, "item", { size: 26 })}${t(PAD + 360, 350, "daily_fortune", { size: 26, fill: C.ink })}
${t(PAD + 40, 400, "amount", { size: 26 })}${t(PAD + 360, 400, "$0.01 USDC", { size: 26, fill: C.ink })}
${t(PAD + 40, 450, "network", { size: 26 })}${t(PAD + 360, 450, "solana", { size: 26, fill: C.ink })}
${t(PAD + 40, 500, "transaction", { size: 26 })}
<rect x="${PAD + 346}" y="470" width="120" height="44" rx="6" fill="none" stroke="${C.bad}" stroke-width="3"/>
${t(PAD + 360, 500, "0OIl!", { size: 26, fill: C.ink, weight: 700 })}
${t(PAD + 500, 500, "← not base58 · not 64 bytes · identifies nothing", { size: 20, fill: C.muted })}
${t(PAD + 40, 550, "signature", { size: 26 })}${t(PAD + 360, 550, "ed25519 · matches published key", { size: 26, fill: C.ink })}
${t(PAD + 40, 640, "/api/verify → valid: true", { size: 22, fill: C.muted })}
${foot("Certificate validity is not transaction validity. 0, O, I, l are exactly the characters base58 excludes.")}
`);

{
  const cols = 11, size = 56, gap = 14, x0 = PAD, y0 = 260;
  let body = "";
  for (let i = 0; i < 44; i++) {
    const ok = i < 36;
    const x = x0 + (i % cols) * (size + gap), y = y0 + Math.floor(i / cols) * (size + gap);
    body += `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="8" fill="${ok ? C.good : C.bad}"/>`;
    body += t(x + size / 2, y + size / 2 + 8, ok ? "✓" : "✕", { size: 24, anchor: "middle", fill: C.surface, weight: 700 });
  }
  files["cross-grid"] = page("SDK agrees on 44 of 44", `
${kicker("@x402/svm facilitator scheme · Node · network operations prohibited")}
${title("44 recorded Solana fixtures. The SDK agreed on 44.")}
${body}
<rect x="${PAD}" y="590" width="22" height="22" rx="4" fill="${C.good}"/>${t(PAD + 34, 608, "✓ valid transaction shape · 36 · SDK: valid", { size: 22, fill: C.ink2 })}
<rect x="${PAD}" y="630" width="22" height="22" rx="4" fill="${C.bad}"/>${t(PAD + 34, 648, "✕ deliberately invalid · 8 · SDK: invalid", { size: 22, fill: C.ink2 })}
${foot("Real ed25519 signatures; blockhash, funding and chain state simulated; nothing broadcast.")}
`);
}

/* ───────────────── THE 400 ───────────────── */

{
  const segs = [["missing or invalid request inputs", 276, false], ["no body at all", 250, false], ["other", 50, false], ["mentions payment / signature / nonce", 40, true]];
  const total = 616, x0 = PAD, bw = W - 2 * PAD, y = 300, th = 24, gapPx = 2;
  let x = x0, body = "";
  for (const [k, v, hot] of segs) {
    const w = (v / total) * bw - gapPx;
    body += `<rect x="${x}" y="${y}" width="${w}" height="${th}" fill="${hot ? C.series : C.line}"/>`;
    x += w + gapPx;
  }
  // direct labels: the two big segments inside-top, the two small ones outside via leaders
  const lab = (frac, txt, up, hot) => {
    const cx = x0 + frac * bw;
    return `<line x1="${cx}" y1="${up ? y - 12 : y + th + 12}" x2="${cx}" y2="${up ? y : y + th}" stroke="${C.muted}" stroke-width="1"/>` +
      t(cx, up ? y - 22 : y + th + 40, txt, { size: 21, anchor: hot ? "end" : "middle", fill: C.ink });
  };
  body += lab(138 / 616, "276 · 44.8% · request inputs", true, false);
  body += lab((276 + 125) / 616, "250 · 40.6% · no body", true, false);
  body += lab((276 + 250 + 25) / 616, "50 · other", true, false);
  body += lab((276 + 250 + 50 + 40) / 616, "40 · 6.5% · payment ←  what I blamed", false, true);
  files["400-featured"] = page("616 four-hundreds, sorted by what the body says", `
${kicker("August 2026 walk · 1,707 attempts · 616 answered 400 after a signed payment")}
${title("What the 400s actually said")}
${body}
<rect x="${PAD}" y="540" width="22" height="22" rx="4" fill="${C.line}"/>${t(PAD + 34, 558, "not about payment · 576", { size: 22, fill: C.ink2 })}
<rect x="${PAD + 420}" y="540" width="22" height="22" rx="4" fill="${C.series}"/>${t(PAD + 454, 558, "mentions payment in any form · 40", { size: 22, fill: C.ink2 })}
${t(PAD, 650, "The August report called all 616 facilitator rejections of signed payments.", { size: 24, fill: C.ink })}
${t(PAD, 690, "Read the bodies: 6.5% mention payment at all.", { size: 24, fill: C.ink })}
${foot("Keyword pass over bodies capped at 200 chars. 250 empty bodies are unclassifiable. scripts/four-hundred-buckets.mjs")}
`);
}

files["400-form"] = page("The field the challenge doesn't have", `
${kicker("x402 v2 · PAYMENT-REQUIRED · accepts[0]")}
${title("The 402 challenge, as a form")}
${card(PAD, 220, W - 2 * PAD, 470)}
${[["scheme", "exact"], ["network", "eip155:8453"], ["asset", "0x833589…2913"], ["amount", "1000"], ["payTo", "0x4040…017F"], ["maxTimeoutSeconds", "300"], ["resource", "https://…/api/thing"]]
  .map(([k, v], i) => t(PAD + 40, 280 + i * 46, k, { size: 24 }) + t(PAD + 400, 280 + i * 46, v, { size: 24, fill: C.ink }))
  .join("")}
<rect x="${PAD + 24}" y="590" width="${W - 2 * PAD - 48}" height="70" rx="8" fill="none" stroke="${C.bad}" stroke-width="2" stroke-dasharray="8 6"/>
${t(PAD + 40, 634, "required inputs", { size: 24 })}${t(PAD + 400, 634, "(no field in the spec)", { size: 24, fill: C.ink })}
${foot("A buyer that speaks x402 fluently has read everything the protocol offers and still cannot build a valid request.")}
`);

{
  const rows = [["400 after signed payment", 616, true], ["still 402 after paying", 188, false], ["422 unprocessable", 124, false], ["wrong status on unpaid probe", 123, false], ["no PAYMENT-REQUIRED header", 81, false], ["500 / 502", 51, false], ["payTo is ENS, no resolver", 21, false]];
  const max = 616, x0 = PAD + 420, bw = W - PAD - x0 - 100;
  let y = 240, body = "";
  for (const [k, v, hot] of rows) {
    const w = (v / max) * bw;
    body += t(x0 - 24, y + 17, k, { size: 22, anchor: "end", fill: C.ink2 });
    body += hbar(x0, y, w, hot ? C.series : C.line);
    body += t(x0 + w + 16, y + 17, String(v), { size: 22, fill: C.ink });
    y += 62;
  }
  files["400-taxonomy"] = page("Failure taxonomy, 1,707 attempts", `
${kicker("August 2026 walk · 1,589 domains · 489 settled · $5.7355 ledger, $6.3970 on chain")}
${title("Where 1,707 attempts died")}
${body}
${foot("The 188 that stayed 402 after paying are the real payment failures. They are a third the size of the 400.")}
`);
}

for (const [name, html] of Object.entries(files)) writeFileSync(join(OUT, `${name}.html`), html);
console.log(`${Object.keys(files).length} images → ${OUT}`);
