/**
 * WHAT WE BOUGHT FROM THE NEIGHBOURS, AND WHAT CAME BACK.
 *
 * The keeper's instinct, 2026-07-29: agents quote comparison tables,
 * so publish one. The version that would have been a gimmick is the
 * one listing everyone else's flaws — the trust list already refuses
 * to say "safe" or "recommended" about anyone, because those are
 * predictions about somebody else's future signed with our key, and a
 * flaw table is the same claim wearing a minus sign. It would also be
 * the one thing this store publishes that a stranger cannot check.
 *
 * So every row here is a RECEIPT. What we paid, when, what we asked
 * for, and what came back — a dated observation about a transaction,
 * which is the only claim about another business we are entitled to
 * make. No row without a purchase. That also means it cannot be
 * padded: growing this page costs money.
 *
 * The rule cuts both ways, 2026-09-10. A door that hung on every
 * signed attempt and settled nothing gets no row, however loud the
 * finding — the page measures completed purchases, and that one
 * completed none. Failed attempts belong in the walk ledger under
 * research/x402-walk-ledger, in a shape a stranger can re-derive.
 *
 * AND OUR OWN SCORE GOES FIRST, unflattered. The first row is a
 * competitor's product assessing US, and it says `review`, 63/100. A
 * comparison page that opens with the author's worst number is one a
 * model will quote; one where everybody else has the flaws is an
 * advertisement and gets read as one.
 */

export interface NeighbourReceipt {
  /** The service, named plainly. */
  origin: string;
  name: string;
  /** ISO date of the purchase. Not "recently". */
  date: string;
  paid_usdc: number;
  /** What we asked it to do, in the words we'd use to a person. */
  we_asked: string;
  /** What came back. Verbatim where it was short enough to quote. */
  came_back: string;
  /** What we took from it. Labelled as ours, never as theirs. */
  our_reading: string;
  /** Who bought it, because a receipt with no buyer is an assertion. */
  bought_by: string;
}

export const NEIGHBOUR_RECEIPTS: readonly NeighbourReceipt[] = [
  {
    origin: "https://402sentinel.com",
    name: "402sentinel",
    date: "2026-07-29",
    paid_usdc: 0.002,
    we_asked:
      "Score THIS store's own payment address, using nothing but its on-chain history.",
    came_back:
      'decision "review", risk_score 63/100. Factors: "address only 6d old" and "only 2 real payers over 29 settlements — concentrated / possible self-wash". Recommended policy: cap $5 per payment, $15 per day, require human approval.',
    our_reading:
      "Correct on every point, and the most useful thing anyone has told us. We flag house traffic in our own books and the chain carries no such flag, so from outside our settlements are indistinguishable from a store buying from itself — which, mechanically, most of them are. Their product did the job it advertises on a customer who did not want flattering. We published /house-ledger.json in response, so the addresses can be subtracted by anyone who wants to score us again.",
    bought_by: "CV",
  },
  {
    origin: "https://jsonguard.leeworks.dev",
    name: "jsonguard",
    date: "2026-07-29",
    paid_usdc: 0.01,
    we_asked:
      "Validate a JSON document against a schema, over x402, from a hand-rolled client rather than an SDK.",
    came_back:
      "A clean 402, then a 200 on the first real attempt. The payload shape matched the spec exactly, with no ambiguity to guess at. One 400 before that was our own wrong endpoint guess, not theirs.",
    our_reading:
      "Protocol-correct and unfussy. Worth saying plainly because we spent an evening failing to pay ourselves: a hand-rolled client cleared their door first try, which is the bar.",
    bought_by: "CV",
  },
  {
    origin: "https://true402.dev",
    name: "true402",
    date: "2026-07-29",
    paid_usdc: 0.005,
    we_asked:
      "Check a token for safety: structural checks plus a live buy/sell simulation.",
    came_back:
      "A clean 402, then a 200. Structural checks plus honeypot simulation by eth_call at two trade sizes, and — the part worth copying — explicit uncertainty labelling: a null honeypot result says it could not be simulated and warns you never to read that as safe.",
    our_reading:
      "Adjacent lane rather than ours (pre-trade safety, not trust listing), competently run, and the uncertainty labelling is the same discipline we try to hold: say what the answer is NOT. Nothing about this purchase reflects badly on anyone.",
    bought_by: "CV",
  },
  // 2026-09-08 → 2026-09-10: three field runs (Rubric, LION, the
  // directory's top-10 board), every row reconciled against the run
  // ledger and the chain. Attempts that never settled do not appear.
  {
    origin: "https://rubric-protocol.com",
    name: "Rubric Protocol",
    date: "2026-09-08",
    paid_usdc: 0.886,
    we_asked:
      "Walked their whole shelf: 18 signed buys covering all 17 doors, methods rotated (hand-rolled python, node EVM, one Solana rail), the way a buyer with no SDK experiences it.",
    came_back:
      "16 of 17 doors clean 402→200. ML-DSA-65 post-quantum signatures on attestations, a free_demo door, a verify-audit endpoint, real error hygiene. One GET-vs-POST doc mismatch and an undocumented evidence-retain vault — reported to them by email the same evening.",
    our_reading:
      "Signed attestation with actual error hygiene, cleared by a hand-rolled client on the first pass. The doc mismatch is the kind of seam only a paying client finds, which is why we paid.",
    bought_by: "CV",
  },
  {
    origin: "https://lionx402.com",
    name: "LION",
    date: "2026-09-08",
    paid_usdc: 1.416,
    we_asked:
      "Bought all 31 GET doors — sanctions screens, company enrichment, SEC financials, web search/scrape, Base RPC proxy.",
    came_back:
      "31 for 31 clean. Every response carries an ed25519 attestation block (payload_sha256, one signer key). Free sample doors are allowlist-gated to 12 big-brand domains and refused scvd.store honestly; a free declare-need router works for everyone else.",
    our_reading:
      "A keyless-counterparty-data shelf with honest gating. One signer key across all doors — no key registry, no anchor chain, no verify URL. A lighter trust surface than ours or Rubric's; worth knowing when you read their attestations.",
    bought_by: "CV",
  },
  {
    origin: "https://api.agentstools.dev",
    name: "agentstools",
    date: "2026-09-09",
    paid_usdc: 0.008,
    we_asked:
      "Bought three data doors with hand-rolled signed payments, no SDK.",
    came_back:
      "3 for 3 clean x402 v2, instant settlement.",
    our_reading:
      "Boring in the best way. Their own description notes the same catalog over Solana at payai.agentstools.dev — untested by us.",
    bought_by: "CV",
  },
  {
    origin: "https://clinic.sapthumbprint.com",
    name: "The Clinic",
    date: "2026-09-09",
    paid_usdc: 0.012,
    we_asked:
      "Bought GLP-1 Q&A content per-line and per-article.",
    came_back:
      "A named human's writing — Sarah Anderson, MSN, APRN, ANP-BC, board-certified Nurse Practitioner — sold at $0.001 per line up to $1.00 per article, “never paraphrased, never summarized.” Accepts GET-with-body or POST.",
    our_reading:
      "Listed top-3 on the directory board at purchase time, and what it sells is a named human's labour by the line. The closest cousin to our keeper's letters anywhere on the list.",
    bought_by: "CV",
  },
  {
    origin: "https://agentbit.app",
    name: "AgentBIT",
    date: "2026-09-09",
    paid_usdc: 0.01,
    we_asked:
      "Bought the transform door and two siblings.",
    came_back:
      "The first call came back 200 with first_call_free: true — “your payment authorization was never settled and no funds moved” (confirmed on-chain: no transfer) — plus volume tiers (100 calls/30d → 10% off, 1000 → 20%) advertised inside the 402 challenge itself. The amount on this row is the two sibling doors; the first call cost nothing.",
    our_reading:
      "A loyalty scheme living entirely in the challenge — the first growth mechanic we've seen ride the 402, and it cost us nothing to learn it. One interop hazard: their middleware demands exact-uppercase PAYMENT-SIGNATURE, so case-normalizing clients fail there.",
    bought_by: "CV",
  },
  {
    origin: "https://x402.sniperx.fun",
    name: "SniperX",
    date: "2026-09-09",
    paid_usdc: 0.011,
    we_asked:
      "Bought ping, then token/price for a real mint address, on the Solana rail.",
    came_back:
      "Ping settled fine. token/price SETTLED $0.01 on-chain (real transaction), then 404'd “Token not found” — payment taken before resource validation. The settlement is Solana mainnet signature qnmeaFjfRE2iMVVtcVCyGmu5mgT56ddyoDBe62AJ5Ai84ydU8rBiN2svFQX7YaqT7KQVaLtBirLreKpnSp9gmAQ: err null, one transferChecked of exactly 10,000 USDC base units ($0.01) to the USDC mint, blockTime 2026-09-09T14:26:23Z, 41 seconds before our ledger stamp. Check it at https://solscan.io/tx/qnmeaFjfRE2iMVVtcVCyGmu5mgT56ddyoDBe62AJ5Ai84ydU8rBiN2svFQX7YaqT7KQVaLtBirLreKpnSp9gmAQ",
    our_reading:
      "The one door in three field runs where money moved and nothing came back for it. $0.01 of tuition: settle-after-validate is a real ordering property, and this is what it looks like backwards.",
    bought_by: "CV",
  },
  {
    origin: "https://x402engine.app",
    name: "x402engine",
    date: "2026-09-09",
    paid_usdc: 0.003,
    we_asked:
      "Bought three GET doors.",
    came_back:
      "3 for 3 clean. POST on GET-shaped doors returns 403 rather than 402/404; every door also accepts eip155:4326 (USDm) and Solana, Base first.",
    our_reading:
      "A clean multi-rail shelf; the 403 is mild shape noise, harmless.",
    bought_by: "CV",
  },
  {
    origin: "https://shelf.thirdmade.net",
    name: "thirdmade",
    date: "2026-09-09",
    paid_usdc: 0.002,
    we_asked:
      "Bought three doors from their live manifest.",
    came_back:
      "Two delivered clean; /probe/hallucination-check 404s while listed active on the directory. The 404 took no money — the amount on this row is the two that delivered.",
    our_reading:
      "A dead door in a live manifest. The rest of the shelf works.",
    bought_by: "CV",
  },
  {
    origin: "https://agenttoll.app",
    name: "agenttoll",
    date: "2026-09-09",
    paid_usdc: 0.003,
    we_asked:
      "Bought three doors.",
    came_back:
      "3 for 3 — clean, cheap, fast.",
    our_reading:
      "Does what it says at the price it says.",
    bought_by: "CV",
  },
  {
    origin: "https://x402.ottoai.services",
    name: "Otto AI",
    date: "2026-09-09",
    paid_usdc: 0.003,
    we_asked:
      "Bought three doors including crypto-news and chain-status.",
    came_back:
      "The news door returned a same-hour generated market brief; chain-status returned live Base block data matching our own RPC reads.",
    our_reading:
      "Listed #1 on the directory board at purchase time. The three doors we bought answered with live content the same hour; the shelf lists around 80 more that we did not buy.",
    bought_by: "CV",
  },
  {
    origin: "https://apiacre.com",
    name: "API Acre",
    date: "2026-09-09",
    paid_usdc: 0.003,
    we_asked:
      "Bought three data doors.",
    came_back:
      "Official-source public data — SEC, GLEIF, OFAC, USAspending, Federal Register, NOAA — with versioned service names and a request_id on every response.",
    our_reading:
      "Of the shelves we bought from in this run, the one whose answers say where they came from: official sources, versioned service names, a request id you can quote back.",
    bought_by: "CV",
  },
  {
    origin: "https://api.usenami.io",
    name: "Usenami",
    date: "2026-09-09",
    paid_usdc: 0.005,
    we_asked:
      "Bought funding-rate data across perp venues.",
    came_back:
      "30+ venues covered; the queryParams schema says paging is there so you do not pull all of it into your context, and responses carry total/limit/offset/has_more.",
    our_reading:
      "Docs that talk the buyer out of overspending. Vendor honesty as a feature — we copied the instinct into our own buyer guidance the same week.",
    bought_by: "CV",
  },
  {
    origin: "https://api.bitrefill.com",
    name: "Bitrefill",
    date: "2026-09-09",
    paid_usdc: 0.003,
    we_asked:
      "Bought gift-card product detail for their own documented example slug.",
    came_back:
      "Their example slug was stale — but the 404 body carried a machine-readable error_code, agent_instructions (“Search again; do not retry the same slug”), a next_step URL, and suggestions with correct slugs. They did NOT settle payment on the failed call; the amount on this row is what settled at Bitrefill in the same walk.",
    our_reading:
      "A 404 that tells the agent what to do next and takes no money for saying so. An established commerce company running a real x402 storefront.",
    bought_by: "CV",
  },
  {
    origin: "https://proxy.suverse.io",
    name: "SuVerse Pay",
    date: "2026-09-09",
    paid_usdc: 0.052,
    we_asked:
      "Bought three doors including a $0.05 data tier.",
    came_back:
      "~500 proxied data endpoints; the $0.001 doors work, but the real data doors are $0.05. Their ip-geolocation correctly outed our box as an IPv6 in France.",
    our_reading:
      "A proxy shelf with a 50x price tier between teaser and data. Works as advertised; read the price column before you buy.",
    bought_by: "CV",
  },
  {
    origin: "https://x402.forgemesh.io",
    name: "ForgeMesh",
    date: "2026-09-10",
    paid_usdc: 0.003,
    we_asked:
      "Bought hash-text, convert-units, and agent-fortune with hand-rolled signed payments.",
    came_back:
      "3 for 3, fast and correct — right sha256, right math, and a fortune for agents (“The endpoint you seek is one directory listing away,” lucky_http_status: 200). Every response carries a self-describing meta block: endpoint, price, fetchedAt, related doors, provider, /openapi.json catalog.",
    our_reading:
      "The first 'verified'-badged service on the directory board, and the badge survived a real signed walk. ~415 POST doors at a flat penny.",
    bought_by: "CV",
  },
] as const;

export const NEIGHBOURS_STANDFIRST =
  "Services we have paid for with our own money, what we asked them, and what came back. Every row is a receipt rather than an opinion — there is no row here without a purchase behind it. That is also why it grows in bursts: a field run adds a dozen rows in a day, then nothing for weeks, and an attempt that never settled does not appear at all.";

export const NEIGHBOURS_SCOPE_NOTE =
  "WHAT THIS IS NOT: a ranking or a recommendation. We do not rate these services and we will not tell you which to use — those are predictions about somebody else's future behaviour, and this store does not sign those, for neighbours or for itself. What is recorded is a dated observation of one transaction. A service that served us well on the date shown may be different today, and a reading in the last column is OURS, not theirs.";

export const NEIGHBOURS_OWN_SCORE_NOTE =
  "The first row is a competitor's product assessing this store, and it did not come back flattering: `review`, 63/100, on the grounds that almost nobody but us has ever paid us. That is true. It is here first on purpose — a comparison page written by an interested party is worth reading only if the author's own bad number is on it.";

export const NEIGHBOURS_CORRECTION_NOTE =
  "If you run one of these services and a row is wrong, unfair, or out of date, write to the mailbox at /api/letter and it gets corrected or removed. A correction costs nothing and needs no argument — we would rather hold an accurate page than win a point.";
