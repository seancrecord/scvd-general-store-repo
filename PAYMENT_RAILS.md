# PAYMENT_RAILS.md — the second-rail work order, and the audit that gates it

CV's MPP integration spec (2026-08-03), revised by the desk the same
day with the amendments evidence demanded, and adopted as the standing
process for EVERY future rail — MPP, Solana-exact, whatever arrives.
His original sequencing survives untouched because it is correct:
**audit the existing flow first, gate the new rail on the audit
passing plus hard facts verified, red-team after shipping.**

## The standing intake rule for rails (adopted from his B.5)

Two independently-growing lists, never entangled:
1. **Accepted payment schemes** grow by one entry only when a real,
   named counterparty proves an existing entry doesn't serve them —
   never preemptively because a player is big. (This gate already
   ruled correctly once: `gokite-aa` stayed out.)
2. **Discovery registry listings** grow additively — metadata
   registrations, never payment-flow changes. Tracked separately,
   shipped independently.

## Part A — the current-flow audit. RUN 2026-08-03, results below.

One amendment to the original: A.1.1's "a probe should never create
ANY state" is too strong. 402s deliberately write OBSERVABILITY state
(decline counters, event rows — bounded and allowlisted since the
venue hardening), because a census that cannot see window-shoppers
cannot falsify "nobody came." The invariant as audited: **no MONEY
state — no order, no cert, no patron number — before a signature.**

| # | Scenario | Verdict | Evidence |
|---|----------|---------|----------|
| A.1.1 | 402 issued, buyer never signs → no money state | **PASS** | test/payment-flow-audit.spec.ts (new); patron counter unchanged by unsigned probes |
| A.1.2 | Bad signature / expired offer → no settle, clear error | **PASS** (existing) | facilitator verify-fail paths in test/paid-flow.spec.ts, decline desk records reason |
| A.1.3 | Facilitator settle fails → no cert, no patron, legible error | **PASS** | test/payment-flow-audit.spec.ts (new): settleShouldFail → 402, no cert_id anywhere in body, patron unchanged |
| A.1.4 | Settled but our write fails → money moved, no receipt | **COVERED BY DESIGN, verify live** | delivery intents + hourly delivery audit (problem ledger #18) + chain reconciliation (ledger #4, the one check independent of our own writes). CV live-verification welcome but the machinery predates this audit |
| A.1.5 | KV read-after-write 404 on fresh verify | **PASS** (existing, 08-01) | loud explicit message shipped; CV confirm-live optional |
| A.1.6 | Same Idempotency-Key retry → replay, not double settle | **PASS** (existing + new race test) | test/idempotency-replay-authorization.spec.ts; concurrent same-key race added in payment-flow-audit.spec.ts — at most one distinct cert |
| A.1.7 | Fresh authorization, no key → honest second charge, warned | **PASS** (existing) | before_you_retry on declines; idempotency.suggested_key on 402 |
| A.1.8 | amount_check on EVERY priced 402 | **PASS** (new) | payment-flow-audit.spec.ts iterates the whole menu, not just small_blessing |
| A.1.9 | Human-queue polling states | **PASS** (existing) | order routes tests; sold-out refuses pre-402 |
| A.2.a | Concurrent stock race past the ceiling | **REAL — cannot be prevented on KV; silence refused instead** | recordInventorySale is read-modify-write, stock gate runs before payment gate: two buyers at remaining=1 both pass. KV has no transactions. THE FIX SHIPPED: the sale count returns to the caller, and a sale past the ceiling fires an OVERSOLD alert naming the order and the refund instruction — the keeper settles it by hand, never unknowing. Pinned deterministically (the race outcome is simulated; the backstop is asserted) |
| A.2.b | Concurrent same-key idempotency race | **PASS** — with a finding about the instrument, not the flow | Two simultaneous same-key requests → ≤1 distinct certificate. The test flaked at first and the flake was the finding: the KV replay guard is read-modify-write, so two concurrent requests can both pass it — in production the CHAIN is the backstop (EIP-3009 reverts a reused nonce), but the mock facilitator settled the same authorization twice, i.e. the instrument was looser than reality. Fixed by making the mock enforce nonce-once like the chain (test/helpers/facilitator-mock.ts); same lesson as the per-isolate rate buckets and the exactly-100 census page |

**Items marked for CV's live hands** (cannot be proven from inside):
A.1.4 and A.1.5 confirm-live; a real concurrent double-buy attempt
against production on a stocked item (expect: both settle at worst,
OVERSOLD alert fires, keeper refunds one — the documented outcome,
not a silent one).

## Part B — MPP (evm.charge, crypto-only). GATES RUN 2026-08-04. GATE 1 FAILED — RE-SCOPED TO WAIT-AND-SEE.

The gates as originally posed, and what CV's primary-source read
(paymentauth.org/draft-evm-charge-00 and mpp.dev/quickstart/server +
/advanced/security, the documents themselves, not summaries) returned:

**Gate 1 — is `evm.charge` a drop-in `accepts[]` entry? NO. It is
not x402 at all.** `evm.charge` is the EVM payment method for the
IETF-track "Payment HTTP Authentication Scheme"
(I-D.httpauth-payment) — a separate parent protocol. The offer rides
a `WWW-Authenticate` challenge header (base64url, JCS-canonicalized
JSON — draft §4 ¶1), the client answers with `Authorization: Payment
<credential>`, and the flow (§1.4) contains no `accepts[]` and no
payment-signature header anywhere. Its credential negotiation
(§4.2.2: permit2/authorization/transaction/hash) is its own. Building
it is standing up a SECOND challenge/credential protocol beside x402
— new headers, new encoding, new security surface, coupled
idempotency across two protocols — not appending an array entry.

**Gate 2 — is crypto-only registration-free? PASSED, as far as two
pages can confirm.** The Direct signing path is a self-generated key;
`MPP_SECRET_KEY` is self-generated HMAC root-of-trust material (their
security doc's own language), not an issued API key; no
account-creation step exists on either page. The only
registration-flavored line is optional DISCOVERY listing (MPPScan /
MPP Services directory), which gates nothing. Honest bound stated by
the auditor: "didn't find one across two pages," not "confirmed
absent system-wide"; the `Mppx.create` SDK reference is the next
document if this ever needs to be airtight.

**The wrinkle that connects them:** every server-quickstart example
is `tempo.charge()` — Tempo (Paradigm/Stripe's chain, pathUSD) —
and `evm.charge` appears nowhere on MPP's server docs. MPP appears
to implement the same PARENT scheme but ship a Tempo-specific
credential. So "build evm.charge, get MPP crypto-only for free" is
likely TWO code paths under one spec, not one deliverable.

**THE RULING, via the standing intake rule at the top of this file:**
an accepted payment scheme grows by one entry only when a real,
named counterparty proves the existing entry doesn't serve them. No
buyer has asked for httpauth-payment, MPP, or Tempo; the build is a
parallel protocol, not a door that takes a day (so the door-cost
lens, which rightly overrode demand-gating for CHEAP doors, does not
override here — both lenses point the same way for once). MPP moves
to WAIT-AND-SEE behind Solana. What reopens it: a named counterparty
asking to pay via this scheme, OR the scheme showing up in ward-round
drift data as ecosystem-adopted (C.9 already tracks scheme drift, so
the watch is automatic, not a memory).

Architecture notes preserved for whenever it reopens: one 402,
existing exact entry untouched, zero new buyer-facing branches;
idempotency one cache across rails (C.4 attacks it); cert records
carry which rail settled, signed at mint. Card/KYC legs stay ruled
out (fee math: ~$0.30 + 2.9% against a $0.005 floor item).

The Solana-exact door (sized 2026-08-03, PROBLEMS.md) runs through
THIS SAME order of operations — Part A is now done for both; Solana's
remaining gates are its two hands-items (key ceremony, supported-kinds
check) plus the reconciliation-limit ruling.

## Part C — post-ship red team. Unchanged from CV's spec, one addition.

C.1 (naive x402-only agent unaffected) is the load-bearing test, run
as a genuinely clean-context subagent per the cold-walk discipline.
ADDITION C.9: the ward round and preflight advisories should observe
the new rail's entries as ordinary data (scheme/network drift
tracking) — confirm the store's own instruments read its own second
rail without special-casing it.
