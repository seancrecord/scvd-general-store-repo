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

This is prospective authorization coordination, not a complete reservation of
all obligations. The ledger begins with authorizations routed through this
version. Older outstanding authorizations, unsigned contribution commitments,
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
