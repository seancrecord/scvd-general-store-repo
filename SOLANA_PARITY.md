# SOLANA_PARITY.md — every place Solana lags Base, and what closing each gap actually takes

Written 2026-08-21, the day Ramp lit x402 on Solana for 70,000
businesses (agents.ramp.com) and the keeper asked the right question:
why isn't everything rail-symmetric? The honest answer splits by chain
family. EVM chains (Base, Polygon) share one machine, so parity there
is configuration; Solana is a different machine, so each capability is
its own build with its own correctness risk. This file is the
checklist of those builds, with the nuance recorded while it is fresh,
so nobody has to re-derive it later.

The standing rule (stated in chat 2026-08-21, recorded here):
**money-in is symmetric everywhere; EVM chains get full parity by
parameterization; Solana gets each capability as its own build —
except money-out, which stays EVM until the chain offers primitives
that don't require becoming a custodian.**

## Already symmetric — no gap, listed so nobody "fixes" them

- [x] **Paying us.** Every door quotes the Solana rail (flag-gated on
  SOLANA_PAY_TO, live since 2026-08-04). Same facilitator verifies and
  settles; buyer stays gasless (facilitator fee-payer).
- [x] **Certificates.** Record whichever rail settled at mint
  (`asset`, `network`, `settlement_tx` — a Solana signature is a
  first-class settlement id).
- [x] **Settlement attestation (`settlement_attestation`).** Reads
  BOTH chains — the identifier's shape picks the rail (0x hash → Base,
  base58 signature → Solana).
- [x] **Bank reconciliation.** A Solana-side walk exists
  (chain-reconciliation), same day-counted method as Base; the
  unreconciled cap stood down when it went alive.
- [x] **Rails accounting.** `railOf` buckets solana its own way; the
  organic split and net-by-chain statement carry a solana side.

## The gaps, in build order

### 1. The Solana Statement — `the_statement` reads Base only
**Demand evidence: STRONG as of 2026-08-21** — a Ramp-provisioned
agent wallet lives on Solana, and "audit this agent wallet against the
chain" is exactly the product. This is the first gap to close.

- [x] DONE 2026-09-02: `src/lib/solana-usdc.ts` (the walk) and
  `src/lib/statement-rails.ts` (one artifact shape, three readers).
  `the_statement` and `operator_statement` take `network=solana` and
  a base58 pubkey; the artifact keeps its from/to fields and says
  `unit: "slot"`. The walk reads every USDC token account the wallet
  owns at read time (wider than the ATA floor below) and says what it
  cannot see; a window past the page or signature cap is
  window_unreadable with the reason, never a partial read. Same cert
  classes, same coverage words. `test/solana-statement.spec.ts`.
- **Nuance, recorded so the build starts smart:**
  - EVM walks `eth_getLogs` for Transfer events; Solana has no logs —
    the walk is `getSignaturesForAddress` over the wallet's **USDC
    associated token account (ATA)**, then `getTransaction` per
    signature, reading pre/post token balances. Different pagination,
    different failure modes (RPC truncation at ~1,000 signatures per
    page — the window cap may need to be tighter than Base's 11h, or
    per-page bounded the way STATEMENT_LIST_CAP already bounds Base).
  - A wallet can hold USDC in a non-ATA token account; v1 should walk
    the canonical ATA and SAY SO in the artifact's honest limits, the
    same way the Base statement names its coverage.
  - The existing `src/lib/solana-rpc.ts` (Helius primary + fallbacks)
    is the transport; the reconciliation walker already parses USDC
    transfers — start from that parsing, do not write a third one.
  - USDC mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (the
    constant already lives in the codebase; import, never retype).
  - Same cert class (`wallet_statement`), same coverage vocabulary
    (`complete | window_unreadable`) — the artifact spec should not
    fork per chain, only the reader does.

### 2. Solana bounty claims — the board verifies Base settlements only
**Demand evidence: one letter, 2026-09-05** — a Solana-settled agent
read the board, priced the Base-only reward against its own wallet,
and wrote in. Ramp wallets are Solana wallets too.

- [x] DONE 2026-09-05: `openBounty` captures a Solana door (EVM rails
  preferred when the door quotes both; asset must be the USDC mint),
  and `claimBounty` reads the shapes against the BOUNTY'S rail rather
  than assuming 0x — a base58 signature and a base58 payer on Solana.
  Verification is `solanaTransactionFacts` (the attestation's reader,
  not a third parser): no error, past `SOLANA_FINALITY_SLOTS`, slot ≥
  `opened_slot`, the door's owner credited exactly the captured atomic
  amount and the payer's owner debited at least it. The replay key is
  `bounty_tx:sol:<signature>`, as written; EVM keys keep their shape so
  no paid claim becomes claimable again. `test/bounty-board.spec.ts`,
  "the fourth rail on the board".
- **How the nuance below landed:**
  - Finality is checked on the Solana path and not on the EVM path,
    on purpose: `getTransaction` at "confirmed" can answer for a
    transaction the cluster later drops, and a reward signed against a
    dropped settlement is money for nothing. Inside the window the
    claim is refused and released, and told to come back.
  - The record is chain-tagged by ADDITION, not by overload:
    `opened_slot` is kept beside `opened_block`, because `opened_block`
    is the BASE head the payout-redemption reader scans from, and the
    payout is Base on every rail. `settled_slot` beside `settled_block`
    on the claim; the corpus row prints `slot`, never `block`.
  - Owner-level balance deltas, not ATA-level: the same coverage the
    Solana statement chose, and the door's payTo is an owner pubkey.
  - **The payout stays EVM regardless** (see 4) — a shopper who walks
    a Solana door is paid by EIP-3009 on Base to the 0x `payout_to`
    they name. The public copy says so on the board, in the rules,
    and on the OpenAPI shape.

### 3. Solana Launch Check — the field walker spends on Base only
**Demand evidence: weak** — the census shows only 4 solana-only doors.
Cheap-ish once (2) exists, since both need SPL settlement reading.

- [ ] Teach `performLaunchCheck` to pay a solana-exact accepts entry
  when the target door offers no EVM rail.
- **Nuance:**
  - The field wallet is secp256k1/EVM; paying a Solana door needs a
    Solana field keypair (new secret, new house-ledger entry, new
    attestation-spec note) AND gas: Solana buyers pay via
    facilitator-sponsored fee-payer when buying FROM us, but our
    walker buying from OTHERS signs a transaction the other side's
    facilitator sponsors — check whether their fee-payer flow covers
    an arbitrary buyer before assuming zero-SOL operation.
  - The oracle sanctions screen (see 5) does not exist on Solana; the
    launch check's screen is for OUR payout counterparties, not the
    door — confirm which screens apply before wiring.

### 4. Solana money-OUT (credit cash-outs, bounty payouts) — **structurally blocked, maybe permanently**
- [ ] Nothing to build until the blockers below change; revisit when
  they do. Do NOT copy-paste parity here.
- **The two blockers, named precisely:**
  1. **No EIP-3009 on SPL tokens.** Every payout here is a signed
     `transferWithAuthorization` the RECIPIENT redeems: we hold no
     gas, broadcast nothing, and an unredeemed authorization expires
     free. SPL USDC has no equivalent primitive — a Solana payout
     means the store broadcasting transactions and holding SOL for
     fees, i.e. becoming a custodian with an operational hot wallet.
     That violates the posture the whole money-out design is built on.
     (If Solana's token-2022 extensions or a future USDC feature adds
     a recipient-redeemable authorization, this blocker falls —
     re-check before ruling anything.)
  2. **No Chainalysis on-chain sanctions oracle on Solana.** Payouts
     screen fail-closed against the oracle (Base:
     `0x3A91A31cB3dC49b4db9Ce721F50a9D076c8D739B`; other EVM chains:
     `0x40C57923924B5c5c5455c48D93317139ADDaC8fb`). No oracle → no
     screen → fail-closed refuses every payout anyway. A Solana payout
     path needs a replacement screen (an API with keys we cannot get,
     or another on-chain source) before the first cent.

### 5. Sanctions screening on Solana — no oracle
Folded into (4) for payouts; listed separately because any future
Solana-side money-touching feature hits it.

- [ ] When a Solana screen source exists, wrap it in the same
  fail-closed shape as `oracleScreen` (only byte-exact "clean" permits).

## The EVM side, for contrast (tracked in KEEPER_LIST, not here)

Polygon parity for Statement / bounty claims / credit payouts /
sanctions oracle is parameterization of existing EVM code (RPC URL +
chain id + USDC address) — same machine, same primitives, including
EIP-3009 and the Chainalysis oracle. That pass is scheduled work, not
a gap requiring design.

## Review cadence

Re-read this file when: (a) a buyer asks for any Solana-side artifact
through the window, (b) the board posts its first solana-only door,
(c) Circle or Solana ships a recipient-redeemable transfer
authorization, or (d) a Solana sanctions oracle appears. Any one of
those changes an answer above, and the file should say so with a date
rather than silently rotting.

### Re-read 2026-09-05 — trigger (a), a letter

A Solana-settled agent wrote to the mailbox: it had read two open
bounties, noted the reward redeems on Base only, and asked whether the
store commissions Solana-paid work. Rulings, dated:

- **Gap 2 closed** (above). The half of the complaint the store can
  fix without moving money on Solana is fixed: a Solana door can be
  posted and a Solana wallet can claim it, paid on Base.
- **Gap 4 stands.** Checked against what x402 itself does on Solana:
  the payer signs an SPL transfer and a sponsor co-signs as fee payer
  and broadcasts. The mirror image — the store signs the transfer, the
  recipient co-signs as fee payer — is buildable, but not as the
  instrument the board pays with. A plain Solana transaction dies with
  its blockhash inside about a minute, not seven days; a durable nonce
  gives it the lifetime, but the nonce account needs SOL rent (the
  shopper could fund one with the store as authority), and the
  authorization then has NO self-expiry: an unredeemed reward stays
  live until the store advances the nonce, which is a broadcast and
  SOL. "Expires free, budget takes it back" cannot be replicated. And
  blocker 2 does not move at all: no Solana sanctions screen exists,
  and the payout rule fails closed without one. That is the blocker
  that actually blocks; the nonce mechanics are secondary.
- **The commission itself is not the board's.** A one-off report at
  twenty times the reward ceiling is the keeper's commission, paid by
  hand from the keeper's own Solana wallet on delivery, recorded as
  such. The worker moves no money on Solana. Re-read again when (c)
  or (d) changes.
