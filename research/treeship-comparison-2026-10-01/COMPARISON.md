# Treeship (Zerker Labs) against SCVD — the receipt question

October 1, 2026. Internal decision document, not public copy. Primary-source
read of treeship.dev, treeship.dev/commerce, docs.treeship.dev and the
zerkerlabs/treeship README at v0.31.12 (latest commit 71468dd, Oct 1 2026).
No install, no paid run, no Hub account. Nothing here is a build on the desk;
builds go to ROADMAP, presses to KEEPER_LIST.

## The one-sentence answer

Treeship signs what the agent *says it did*; SCVD signs what a *stranger saw
happen*. In this store's own `/attestation` vocabulary Treeship is the
`self_signed` seat done very well, and SCVD's product is the
`third_party_observation` seat. They do not substitute for the observatory.
They do crowd the receipt-chain narrative, and they are the most natural
composition partner this store has met.

## What Treeship is (read, not summarised from memory)

- Open source, Apache 2.0, Rust core, ~13 MB static binary; TS/Python SDKs;
  WASM verifier for browser/edge; Go reference Hub at api.treeship.dev.
- Captures the agent's own work: tool calls (intent + result digests),
  LLM decisions, human approvals (nonce-bound, single-use, key-bound),
  agent-to-agent handoffs with a live nonce challenge (`custody: live`),
  sealed session receipts, capability cards with SD-JWT-style selective
  disclosure, checkpoint-pinned agent profiles.
- Crypto: DSSE/PAE envelopes, Ed25519, SHA-256 hash chain, Merkle checkpoints,
  per-artifact Rekor (Sigstore) anchoring since 0.31.9. Canonical form is
  "deterministic declaration-order JSON, not full RFC 8785/JCS".
- Verification is offline against the verifier's own pinned roots. Server-side
  verification was deliberately retired (`410 Gone`). The Hub stores bytes,
  serves proofs, never issues a verdict.
- Honest limits stated on their own pages: "a wrong answer with a perfect
  receipt is still wrong"; "Treeship authenticates statements; it does not
  adjudicate commerce"; capture completeness is not a cryptographic property;
  timestamps are the signer's claim; `actor proof: asserted` unless key-bound.
- Commerce page: integration with Anthropic's `commerce-agents` (receipted
  executor class, Claude Code plugin `/add-treeship-receipts`), MCP bridge for
  any MCP server, A2A bridge, Mastercard Verifiable Intent (v0.1 draft),
  Zerker Reason, Robinhood trading MCP (template), Lobster Cash (a published
  skill). Visa TAP, Google AP2, OpenAI/Stripe ACP listed as "adjacent, not
  integrated". Explicitly: "Payment stays with the host"; "a receipt never
  proves the price was right"; cart lines, order reference and payment URL
  are never in a receipt, digests only.
- Funnel: `curl -fsSL treeship.dev/setup | sh` installs, generates a keypair,
  detects Claude Code / Codex / Cursor / Kimi / Hermes / OpenClaw and offers
  to instrument them. No account. Publishing to the Hub is the account step
  (device-flow login, DPoP). No telemetry; adoption measured from Hub
  activity and registry downloads.
- Traction, from the repo page: 13 stars, 3 forks, 69 releases, 6
  contributors of whom two are coding agents. SRI International spinout;
  one New Stack mention.
- Security history, from their own README: five advisories in five months,
  every one "a surface reported a green verdict without a signature check
  rooted in a pinned key". No independent audit yet; all audits internal
  and AI-assisted, by their own admission.

## Job-by-job

| Job | Treeship | SCVD | Who is stronger, and why |
| --- | --- | --- | --- |
| Prove what my agent did during a purchase | Every tool call, approval and handoff signed and chained, sealed per session | `purpose`, `mandate_id` (claim recorded, never enforced), one certificate per purchase | Treeship. Richer capture, approvals are spent once. SCVD never set out to be the agent's runtime. |
| Prove the money moved as quoted | Cart digest at handoff; payment "stays with the host"; never proves the price | `quote` hash over the five signed x402 terms, `settlement_tx`, `settlement_state`, replay kit at `/api/replay/{cert_id}` | SCVD. This is the link they say out loud they do not sign. |
| Prove it happened at a time neither party chose | Signer's clock plus Merkle order; Rekor per artifact since 0.31.9; RFC 3161/OTS still on their open list | OpenTimestamps to Bitcoin on the anchor log and the weekly corpus, verified with an independent Python OTS library | Draw with different roots. Theirs is a public transparency log, ours is Bitcoin. Both honest about the limit. |
| Check a counterparty's door before paying | Nothing. Out of scope by design. | Free preflight, conformance desk, defect vocabulary, corpus history, paid watches | SCVD, uncontested. |
| Check the merchant's receipt | `treeship verify` reads Treeship artifacts only | Conformance desk and `x402-verify` read any issuer's x402 JWS offer/receipt; `/api/verify-receipt` reads any JSON artifact with Ed25519 material | SCVD on interoperability. Neither reads the other's format today. |
| Interoperate with the x402 wire | Own statement types `treeship/*/v1`, own canonical form | The spec's own offer-receipt extension, `did:web` kid, RFC 8785 | SCVD for a payments audience; Treeship for a Sigstore/in-toto audience. |
| Verify offline with no vendor | Fully, by design, every surface | `x402-verify` is zero-dependency and offline; observations still rest on SCVD's one key, which is inherent to third-party observation | Treeship on the artifact; parity on the verifier; the observation layer is a different kind of claim. |
| Get installed | One shell line, keypair generated, hosts detected and wired, Claude Code marketplace entry live | `npm i -g` per package, MCP config per host, fifteen marketplace submissions pending or rejected (DISTRIBUTION.md) | Treeship, clearly. This is ROADMAP's named bottleneck: packaging. |
| Verifier trust record | Five advisories in five months, all the same class | One field-level spec correction on the offer envelope (2026-08-25), one OTS upgrade gap (PR #588), both dated on /corrections | SCVD, narrowly. Do not say it loudly; it is a function of surface area, and the house has its own corrections ledger. |

## Threat reading

- **Substitution for the observatory: low.** They refuse the seat. Their
  commerce page draws the line at "the merchant's side of the counter" and
  "where the networks stop", which is where this store stands.
- **Substitution for the receipt chain narrative: medium.** An operator
  running Treeship already holds a signed record of their agent's side of
  every purchase, including purchases here. `receipt_for_your_human`
  becomes one receipt among many, and ours is the one signed by a party to
  the sale. The answer is positioning, not features: the attestation
  taxonomy already has the words.
- **Narrative capture: high.** "Cryptographic receipts for agentic commerce"
  is their headline, and their commerce page names Mastercard, Visa, Google
  and OpenAI. If the market learns receipts = Treeship, this store's
  receipts read as a smaller version of theirs instead of a different
  thing. Every surface that says "receipt" should say whose eyes.
- **Partnership value: high.** They publish an integrations table with a
  "skill" tier (Lobster Cash is one row) and a docs site that lists
  adjacent protocols with honest status. A row there is reachable.

## What to do, ranked

Builds are proposals for ROADMAP; presses are for KEEPER_LIST. Rule 19 wants
a demand tag: nothing below has a ledger 404 or a stranger asking. Every row
is the anticipated-demand class (the Gretzky amendment of 2026-08-07) and
says so.

### Builds (ROADMAP candidates)

1. **Read DSSE at the free desks.** `/api/verify-receipt` promises "any
   issuer's" artifact and `grep -rn` across `src/`, `verifier/` and `cli/`
   finds no DSSE, no `payloadType`, no PAE. A DSSE/Ed25519 PAE check is a
   small addition on `@noble/ed25519`, already a dependency; the verdict
   stays exactly what it is now (signature over the bytes against a key the
   caller supplies, with `doesNotEstablish` naming actor binding, which is
   their own `asserted`). Verify the bytes as served, never re-serialise:
   their canonical form is not JCS, and ours is the same law for our own
   `signed_payload`. This makes the conformance desk's sentence
   ("a competitor's artifact exactly as readily as ours") true for the most
   visible competitor format, gives a Treeship user a first touch that costs
   them nothing (paste the receipt they already hold), and is the concrete
   row shape CV2 Federation would need anyway. Test by tampering, per the
   house pattern. Also the one place a defect of theirs could surface on
   our page, so the verdict copy must stay "one reading of one artifact,
   not a statement about the issuer".

2. **Let a certificate cite an outside approval, generically.** Today
   `mandate_id` must resolve to our own `/api/mandate/{id}`. An optional
   `cited_artifact: { format, digest, hint }` field, untrusted text with a
   digest, bound into the certificate SIGNED under the same law as
   `purpose`, lets a buyer bind their runtime's approval artifact (theirs is
   nonce-bound and spent once, stronger than our recorded-never-enforced
   mandate) to our third-party certificate. We record the digest and never
   verify the foreign chain on the money path: money fails closed,
   decoration fails open. The chain then reads: runtime approval (agent
   side) → SCVD certificate (neither party) → chain settlement → runtime
   result receipt. No vendor name in the schema: seats, not occupants
   (scorers.ts). Needs a keeper ruling because it adds a signed field to
   the certificate.

3. **One command that wires the hosts.** Treeship's single installer that
   detects Claude Code, Cursor and Codex and writes their MCP config is the
   smoothest funnel in this space, and it sidesteps marketplace review
   entirely. `cli/scvd.mjs` has no `init`. An `scvd init` that detects the
   same hosts and writes `.mcp.json` / plugin config for `scvd-store` and
   the verifier door, offering before writing, would turn the fifteen
   pending submissions in DISTRIBUTION.md into something the developer does
   for themselves in ten seconds. Read-only until the user says yes, per
   rule 17. This is the highest-leverage funnel idea here and it is theirs
   to copy.

4. **Say whose eyes, once, on /attestation and the receipt page.** A short
   derived paragraph from `TRUST_MODELS`: "If your agent's runtime already
   gives you a self-signed session receipt, this is what a certificate from
   a party to the sale adds, and what a third-party observation adds, and
   what neither proves." Names the seat, not the vendor. Zero risk, and it
   is the positioning fix for the narrative threat above.

### Presses (KEEPER_LIST candidates, your hands)

5. **A row in their integrations table.** Their Lobster Cash row is "a
   published skill that wraps every payment in `treeship wrap`". The same
   shape for SCVD is one skill page: run `scvd preflight` / the paid
   evidence call under `treeship wrap`, so the operator's own receipt
   chain carries a hash of the third-party observation it acted on. It is
   their docs traffic pointed at our free door, in their words, with their
   status label. Run the `directory-submission` skill's transport red team
   first; it is a new third-party surface.

6. **Cite them where they already cite the line.** Their
   `what-receipts-prove` page and this store's `/attestation` page say the
   same thing from two seats. A note to Zerker Labs offering the
   composition point (the one PROBLEMS.md §10 drafted for SEP-2828: "their
   receipt says we did it, our observation says somebody disinterested
   checked") is a letter, not a build. Only if you want your name in it.

### Do not build

- Session capture, hooks, agent identity cards, profiles, a hub. PROBLEMS.md
  §D declined white-label trust layers; one keeper against a Rust team with
  69 releases is not a race to enter; and it is the self-signed seat.
- Any ordering or scoring of Treeship receipts, or a "Treeship-compatible"
  badge (rule 43; never a ranking).
- A rebuttal page. Their limits page is as honest as ours. Say whose eyes,
  then stop.

## Patterns worth borrowing (not features)

- `intent_recorded: false` plus a `dropped` counter when recording fails:
  the agent path never breaks and the gap is counted. Same spirit as
  "decoration fails open", made visible per call.
- A "Security history" section in the README with repro scripts beside each
  advisory. `/corrections` already does this; the README does not.
- Adoption measured only from signals the project already owns, each number
  printed with what inflates it. The house already counts this way; worth
  saying on the trust page as a contrast with telemetry-based tools.

## Sources (read October 1, 2026)

- https://www.treeship.dev/ (v0.31.12 landing)
- https://www.treeship.dev/commerce
- https://docs.treeship.dev/docs/concepts/what-receipts-prove
- https://github.com/zerkerlabs/treeship (README at commit 71468dd)
- This repo: RECEIPT_CHAIN.md, PROBLEMS.md §10 and §C–D, HOUSE_RULES.md
  rules 17–19 and 43, ROADMAP.md NOW/SOON, DISTRIBUTION.md,
  src/store/attestation-spec.ts, src/routes/receipt-verify.ts,
  src/routes/conformance-landing.ts, src/routes/scorers.ts, verifier/README.md,
  docs/FEDERATION_2026-09.md, research/competitive-corpus-2026-09-28/COMPETITION.md
