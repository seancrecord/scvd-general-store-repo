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

- [ ] Build `solana-statement`: every USDC transfer in/out of one
  Solana wallet over a stated window, signed.
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
**Demand evidence: none yet** — gated on board traction, but Ramp
wallets are Solana wallets, so a Solana door bounty would need this.

- [ ] Extend `claimBounty` to verify an SPL USDC transfer when the
  claimed tx id is base58-shaped (mirror the attestation's
  shape-picks-the-chain move).
- **Nuance:**
  - Verification = fetch transaction, confirm success, confirm a USDC
    token transfer of exactly the captured atomic amount from claimer's
    ATA to the door's ATA, postdating the bounty's opened slot. The
    replay guard keys on tx id — chain-prefix the key
    (`base:0x…` / `sol:…`) so ids can never collide across chains.
  - `opened_block` becomes `opened_slot` on Solana — the record shape
    needs a chain-tagged variant, not an overload.
  - **The payout stays EVM regardless** (see 4) — a shopper who walks
    a Solana door still gets paid by EIP-3009 on Base/Polygon to an 0x
    address. The claim form already takes `payout_to` separately from
    `payer`, so this composes without new fields.

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
