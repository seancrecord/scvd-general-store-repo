# Images for the September bylines — placement, captions, shot list

Generated images live in `images/png/` (1600×900 at 2×, dark surface,
store palette; sources in `images/src/`, rebuilt by `images/build.mjs` +
`images/render.sh`). Four terminal captures are yours to take; the shot
list is at the bottom. HackerNoon: featured image goes in Story Settings;
inline images upload through the editor and take a caption line beneath.
"Greenify" is optional — these already sit on a near-black surface and
read as native.

Rule of thumb applied: one image per ~300 words, each one placed
immediately after the paragraph that states the thing it shows. Nothing
decorative; every image carries a number the text cites.

---

## 1 · I Told Codex to Rob My Own Store

**Featured:** `39-featured.png` — the four-character purchase card.

| After… | File | Caption |
|---|---|---|
| the paragraph ending "…code I wrote assuming the payment was the hard part." | `39-severity.png` | 39 findings by severity. Payment-layer defects: zero. |
| "Buy a correction…" section, after "…the wrong claim forever. (BUY-005)" | `39-receipts.png` | Two settled purchases, one transaction, two claims. The second artifact carries the first claim. |
| "No charge" section, after "…Delivering the good after reconciliation is still open." | `39-states.png` | Before: an unconfirmed settlement reported as refused. After: unknown is its own state. |

Alt text for the featured: "A terminal card showing a purchase whose
required text field was a null byte: validation passed, payment settled,
the delivered artifact is empty."

---

## 2 · My A2A Agent Passed the Compliance Checker

**Featured:** `a2a-featured.png` — CLI reading left, schema reading right.

| After… | File | Caption |
|---|---|---|
| the opening block, after "…so this is my endpoint and my green build." | `a2a-featured.png` (reuse as inline; HN does not auto-insert the featured image into the body) | The same Task response, read by the checker and by the 0.3.0 schema. |
| "The checker has its own defects", after "Pin the executable, not the README." | `a2a-table.png` | Three places the published CLI and the 0.3.0 specification disagree. |
| "Reproduce it in three requests", after the code block | **YOUR CAPTURE #1** (see shot list) | The three requests against a live endpoint: the completed Task, the -32001 on its own id, the 500 on a null part. |

---

## 3 · A Valid Solana Signature Claimed Another Buyer's Ethereum Receipt

**Featured:** `cross-featured.png` — the envelope.

| After… | File | Caption |
|---|---|---|
| "Defect one", after "…the real buyer's receipt went to a stranger. (BUY-018)" | `cross-sequence.png` | Buyer A pays on Base. The attacker's Solana transaction is real; the EVM address beside it is not signed. The store returns cert_A. |
| "Defect two", after "…a subtler string walks through." | `cross-cert.png` | A certificate with a valid ed25519 signature over a transaction identifier that cannot identify anything. |
| "How it was tested", after "…no disagreement between my verifier and the SDK." | `cross-grid.png` | 44 recorded Solana fixtures through the installed facilitator SDK in Node. 36 valid, 8 deliberately invalid, 44 agreements. |

The featured image can also sit inline after the sentence "**A signature
authenticates the transaction it covers…**" if the section feels bare;
otherwise leave it as featured only.

---

## 4 · I Made 1,707 Paid Requests to 1,589 x402 Endpoints

**Featured:** `400-featured.png` — the 616, sorted by what the body said.

| After… | File | Caption |
|---|---|---|
| the opening, after "…this is a correction to my own published report." | `400-featured.png` (reuse inline) | 616 post-payment 400s, sorted by what the response body says. The teal slice is the part the August report blamed for all of it. |
| "The gap that produces them", after "…failed a customer who did everything the spec asked." | `400-form.png` | Every field an x402 v2 challenge carries. There is no field for required inputs. |
| "The rest of the taxonomy", after "Put the address in the challenge." | `400-taxonomy.png` | Where 1,707 attempts died. The 188 that stayed 402 after paying are the real payment failures. |
| "What this doesn't prove", after "…so does yours." | **YOUR CAPTURE #2** (optional) | Basescan or RPC reconciliation: 669 transfers on chain against 489 in the ledger. |

---

## Shot list — captures only you can take

Take these at a comfortable terminal width (~100 columns), dark theme,
readable font size. Crop to the relevant lines. PNG.

**#1 — A2A, the three requests (required).** Against the *pre-repair*
behavior if you still have it in a branch; otherwise against any A2A
endpoint that reproduces it, or annotate the current (passing) output
as "after." Show, in order:
1. `npx --yes @a2a-compliance/cli@0.3.3 run https://scvd.store --json`
   with the summary line visible (`exit 0`, `16 pass / 20`).
2. The `message/send` curl and the returned Task, `contextId` absent.
3. `tasks/get` with that id → `-32001`.
4. The `parts: [null]` request → HTTP 500.
`research/a2a-2026-09-06/live-probes.json` has the exact bytes if you
want to reproduce from the record rather than re-run.

**#2 — Basescan reconciliation (optional, the-400).** The Base explorer
view of the field-run wallet `0x843b544bf5f0AA6cbf13E94563874878C98cc4a7`
over blocks 50140000–50180000, or a terminal run of the reconciliation
showing 669 transfers / $6.3970. Only if it's quick.

**#3 — the store's /try page (optional, 39-ways or cross-rail).** One
browser shot of https://scvd.store/try with the Base/Polygon/Solana quote
visible. Establishes that the rails in the piece are live and public.

**#4 — HackerNoon profile card (optional, any piece).** Your #7 top
writer card from the earlier screenshot, for social when the piece goes
out. Not for the article body.

---

## Before upload

- Featured images are 1600×900. HN's minimum is smaller; don't upscale.
- Give each inline image the caption from the table; HN uses it as alt.
- Set the AI-assisted story indicator. Every draft carries the note.
- Fill every `[LINK: …]` slot in the drafts before submitting; editors
  bounce unsourced claims.
