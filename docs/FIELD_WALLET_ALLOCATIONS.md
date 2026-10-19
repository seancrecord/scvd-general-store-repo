# Shared field-wallet allocations

The production signing paths for contribution rewards, shopping rewards, field
studies, store-credit cash-outs, paid launch checks and paid directory walks now
share a durable allocation ledger. It is keyed by Base, canonical USDC and the
paying wallet address. Wallet rotation therefore creates a separate ledger.
No cap changes, additional tasks, payment broadcasts or gas sponsorship are part
of this change.

## What the guard enforces

Before signing, validate the EIP-712 domain, authorization type, recipient,
authorizer, nonce, integer amount and validity window. Read Base's finalized
height and the USDC balance at that exact block. Refuse missing, stale (older
than one hour), future or inconsistent readings. After the asynchronous reads,
re-read the ledger and perform the capacity check and insertion synchronously
inside one storage transaction. A competing request therefore sees the earlier
hold, even when both started with the same balance. An older block cannot replace
a newer balance observation.

An identical nonce/program/terms retry reuses its allocation. Rebinding that
nonce to a different amount, recipient, expiry or program fails. A failed or
uncertain signing attempt keeps its hold: there is no optimistic rollback that
might free money behind an escaped signature. No request can sign through a
missing binding or failed allocation read. Test-only injected signers retain the
existing seam; production constructors wrap the real signer.

## Expiry and settlement

A wall clock reaching `validBefore` does not free the hold. Only a finalized
block strictly after that time allows pruning, and the next allocation uses the
USDC balance at that same block. That balance includes any redemption which
landed before expiry. Pruning and the new allocation commit together; a refused
allocation leaves the old ledger intact.

Live authorizations remain counted even after redemption. That is conservative:
a later balance may reflect the debit while its unexpired hold remains. No
confirmation observation from the contribution desk releases these holds early.
The ledger does not equate an issued signature or consumed nonce with payment.

Paid launch checks report allocation unavailability as the store's own unpaid
limit and return their signed observation, without presenting payment to the
seller. Other callers retain their existing refusal and retry paths.

## Private visibility and rollout limits

`/admin/bounties/contributions/reports/funding` shows the first allocation date,
last retained balance observation, total held USDC, and count/amount by program.
The ledger also retains the finalized block used for its balance check. Reading it does not refresh the chain or release
holds. It exposes no recipients, nonces, signatures, reports or wallet secrets.
An unavailable ledger is not displayed as a zero balance. No spendable balance
is claimed.

The migration provisions a new SQLite-backed Durable Object. Main deployment
must provision that class before preview version uploads can use it; a preview
cannot create an unprovisioned class. Missing storage fails closed at signing.

This is prospective authorization and acceptance coordination, not a complete
reservation of all obligations. The ledger begins with authorizations routed through this
version. Older outstanding authorizations and acceptances, work not yet accepted, legacy
manual-payment contribution commitments,
credit not yet cashed out, external wallet scripts and direct wallet transfers
remain outside it. The previous reward inventory is non-atomic and eventually
consistent; it is deliberately not used as an authoritative opening balance.
The new and old reports overlap and must not simply be added together.

Before increasing caps, import or resolve existing obligations with exact
identities, reserve funds when work is committed, and bring external spenders
under the same coordinator (or explicitly isolate their funding). These are
remaining implementation tasks, not evidence that current holds cover the wallet.

## Validation

The competing-request regression is witnessed failing with the shared held-total
check removed: two six-USDC requests both succeed against ten USDC. Restoring the
check permits only one. Tests also cover all program buckets, immutable retries,
expiry against the finalized balance, rollback on insufficient capacity, delayed
older reads, signing failures, missing storage, invalid terms, production signer
wiring, private aggregate output and an unpaid launch-check result.

## October 19: funding new signed-authorization acceptances

For signed-authorization briefs, the review desk now saves an immutable acceptance
intent before requesting a funding hold. It retains the original paying wallet,
brief/submission identity, recipient and exact reward. The shared wallet actor
checks these commitments and all existing authorization holds against the same
finalized balance, then saves the hold before the review becomes accepted.
Concurrent reviews cannot each claim the same remainder. A failed chain read,
missing wallet, insufficient balance or uncertain response leaves the review
pending and the submission intact. This is an operational failure, not a rejected
report or a change to its published reward criteria and deadlines.

Retrying the saved review recovers the same commitment. A conflicting decision
cannot replace an uncertain intent that may already have held funds. The private
desk has a direct retry with the saved fields. A fresh read after external work
preserves concurrent notes and visitor-digest maintenance. The acceptance date
is saved when the final decision succeeds; repeated successful reviews retain it.

Issuance binds that commitment to exactly one nonce, recipient, amount and paying
wallet. The signed authorization and its commitment count once. Wallet rotation
cannot move a retained commitment or issue a replacement authorization from a
new wallet. Signing failures keep both identities available for the same retry.
Existing accepted rows without funding metadata retain their earlier issuance
path; manual-payment briefs retain their original terms and workflow.

Acceptance holds do not expire with the authorization, because an expired
signature does not prove the obligation was paid. This version has no release
operation for these holds: even confirmed desk observations leave them held.
The aggregate count can include a pending review whose funding response was lost.
Consequently the ledger may conservatively count already-paid rewards against a
balance which already reflects their debit. Settlement-aware release is a next
step, with exact payment evidence and a compatible finalized balance required.

Still outstanding: funding before workers reserve/start work, exact import or
resolution of older/manual obligations, uncash-out credit and external spenders.
No cap increase, new brief, automatic acceptance or payment is introduced.
