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

Unlinked live authorizations remain counted even after redemption. That is conservative:
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
version. Older outstanding authorizations, reservations and acceptances, unreserved work, legacy
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
signature does not prove the obligation was paid. The October 19 version had no release
operation for these holds: even confirmed desk observations leave them held.
The aggregate count can include a pending review whose funding response was lost.
Consequently the ledger may conservatively count already-paid rewards against a
balance which already reflects their debit. The October 21 addition below provides settlement-aware release, with exact
payment evidence and a compatible finalized balance required.

Still outstanding: funding before workers reserve/start work, exact import or
resolution of older/manual obligations, uncash-out credit and external spenders.
No cap increase, new brief, automatic acceptance or payment is introduced.


## October 21: releasing a paid contribution hold

The separate **Reconcile funding hold** action on the private contribution desk
uses the original wallet and commitment, even after wallet rotation. It requires
an accepted contribution with a held commitment and issued authorization. Older
acceptances without a commitment and manual-payment briefs cannot use this path.
The existing transaction check remains observational and never releases funding.

The ledger itself reads the supplied receipt, requires the matching Base chain,
canonical USDC AuthorizationUsed/Transfer pair, exact payer, recipient, nonce and
atomic amount, and a successful transaction. The receipt must be at or below a
fresh finalized balance block. Its block hash must match the canonical header at
that height. Missing, stale, inconsistent, reverted, canceled, unpaired or
unfinalized evidence keeps the hold. This trusts the configured RPC observations;
it is not independent consensus verification or a promise against chain failure.

Release and advancement of the retained balance floor share a single SQLite
transaction. Older in-flight allocations cannot subsequently spend the pre-debit
balance. A newer retained balance overtaking a release refuses the stale release.
Actual payment can still be reconciled when other remaining obligations exceed
that observed balance; this does not authorize new spending.

The ledger retains commitment and nonce identities permanently. Same-transaction
retries return the original dated release without another chain read; changed
transactions and attempts to re-fund or re-sign the released identity fail.
If the desk save fails after ledger success, retrying repairs the private task
record without releasing twice. The task is reread after I/O to preserve notes.
This action neither signs nor broadcasts and needs no current wallet key.

The private worker status includes only the release transaction, receipt block
and read time; treasury balance and ledger metadata remain on the private keeper
desk. Public briefs expose no release evidence. The funding report counts active
and released commitments separately and still claims no spendable balance.
Accepted status, reward terms, review date, payment deadline and existing payment
observations remain unchanged. No new signed certificate is implied by this
internal reconciliation; the existing acceptance receipt retains its own scope.

Regression coverage includes concurrent retries, delayed stale allocations,
overtaken releases, atomic rollback, interrupted task saves, exact payment
mismatches, canonical-block lookup, route authentication and private/public
separation. The stale-allocation test is witnessed failing when the atomic balance
floor update is removed, then passing when restored.


## October 21: fund work before a new reservation succeeds

For signed-authorization contribution briefs, a new reservation first saves its
identity and deadline, then requests the exact reward from the shared wallet
ledger. Only a confirmed hold returns `status: reserved`. `funding_pending` blocks
submission and provides a same-key reserve retry or cancellation. A failed or lost
response retains the original key, identity, wallet once resolved, and deadline;
no replacement identity or deadline extension is needed. The pending attempt
occupies its slot until released or expired, preventing a second worker from
starting it. Public availability is a slot count, not a live funding assertion.

Reservation does not ask for a payout address; the worker supplies it with their report. A
submitted report remains held through review, beyond the original submission
deadline. Acceptance binds the immutable recipient and amount and converts the
work hold into the acceptance commitment in one transaction. It does not allocate
again or make earned acceptance depend on a new RPC read. Issuance retains its
fresh shared-balance check, and finalized-payment release remains a separate
keeper action. Rotation uses the original retained wallet; a new key cannot move
this obligation.

Unused release or expiry and keeper rejection stop the work in the task record
before canceling its wallet hold. The ledger saves a cancellation tombstone even
when the funding request has not answered yet. A delayed balance read cannot
recreate that canceled identity. Accepted commitments cannot be canceled through
this path. No funds moved during cancellation, so it does not require a new
balance read or pretend that a transfer occurred.

A cleanup alarm is armed before starting or stopping funded work. It preserves
the earliest expiry and visitor-digest maintenance. Cleanup re-arms before RPC,
keeps uncertain holds conservative, and retries interrupted cleanup, including
a crash after saving a terminal decision but before saving the cleanup intent. The same
release/rejection request also repairs a lost reply. The platform alarm handler
uses the same explicitly clocked maintenance method as the tests. At most the
existing bounded reservation list is processed; no wallet-wide scan is added.
The [Cloudflare alarm contract](https://developers.cloudflare.com/durable-objects/api/alarms/)
defines the platform callback and its one-alarm scheduling behavior.

Private status distinguishes pending, held, transferred-to-acceptance, cleanup
pending, and released funding. The private desk and aggregate inventory show work
holds separately from acceptance holds, counted once in the shared total. Wallet
and hold identities remain private; public briefs state only whether new
reservations require this funding path. This is internal allocation rather than
escrow, payment, full-wallet coverage or a net-income guarantee.

Existing reservations without work-funding metadata keep their original path;
signed work can still acquire its hold at acceptance. Manual-payment briefs are
unchanged. No budget, price, paid slot, gas sponsorship or payment was added.
Outstanding coverage remains older/manual obligations, credit accrual before
cash-out, and external wallet spenders.

Validation covers competing work and other-program authorizations, immutable
retries, delayed funding versus cancellation, cleanup failures and alarms,
reservation expiry versus submitted work, atomic acceptance conversion, wallet
rotation, legacy behavior and private discovery instructions. Removing work holds
from the shared total makes the competing-reservation test fail with two funded
six-USDC reservations against ten USDC; restoring the total passes.


## October 21 — import older issued contribution obligations

The private submission page offers **Import existing obligation** for accepted
signed-authorization work without a managed work hold, including unissued rewards
and interrupted authorization attempts. `POST /admin/bounties/contributions/{id}/import-funding` takes only the
submission ID. Its existing admin authentication, same-origin check and failed-form
retry apply. No caller can supply a replacement wallet, amount, nonce or deadline.

The task saves an import intent before resolving any wallet. If an authorization
intent exists, its original paying wallet and nonce are retained even if no
signature was saved. Otherwise, the currently configured field wallet is selected
once and retained with the debt before the ledger call; an interrupted retry cannot
move the obligation to a newly configured wallet. The ledger validates any retained
signing request, reads a fresh finalized balance, and atomically links the obligation
and authorization identities. Unissued work without an authorization has no nonce
until the separate issuance action binds it. A preexisting
contribution allocation for that exact nonce is reused, not counted twice. A nonce
assigned to another program or obligation, changed terms, canceled work, or a paid
release cannot be imported as a new debt. Repeated imports recover the same result.
Original acceptance dates, receipt bytes, report and any payout remain unchanged.

Later issuance uses the imported hold exactly once and remains subject to the full
capacity check and original-wallet requirement. Imported unsigned rewards refresh
that check even when an earlier attempt already allocated their nonce: an import
may have revealed other debt exceeding the wallet balance. An expired retained intent is not
replaced. If funding identity changes while issuance prepares its signer, issuance
refuses and asks for a retry using the retained obligation. An already-running
signing attempt keeps its original nonce; importing that intent links its allocation
without duplicating the debt. Pending imports never authorize new signing.

Unlike a new reservation, an import recognizes a debt already incurred. A low
balance cannot erase that debt: importing six USDC against one USDC records the
six-USDC hold. The current-wallet report shows a five-USDC **observed shortfall**
against its dated retained balance. Fresh allocations still check all holds.
Unavailable or stale chain reads leave the import pending, never a claimed success.
The shortfall is not a live balance or complete solvency calculation. Imported
obligations on a retired wallet stay with that wallet; the aggregate report still
reads only the currently configured wallet, and the submission names its original
wallet privately.

Expiry alone never erases imported accepted work. The existing separate
finalized-payment reconciliation can release the imported hold once its exact
transfer and canonical block are established. A prior payment observation or manual
payment report cannot release it. This import does not sign, broadcast, refresh an
expired authorization, extend a deadline, raise caps or sponsor gas.

This deploy adds the tool; it does not run a production migration.
Manual-payment briefs, older reservations, other programs' legacy obligations,
credit accrual and external spenders still need their own resolution. A zero
observed shortfall does not close those gaps.

Primary implementation reference read October 21 (recorded in
[SPEC_READS](SPEC_READS.md#2026-10-21--durable-obligation-import-transactions)):
[Cloudflare SQLite storage transactions](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#transactionsync).
`transactionSync` keeps the balance observation and both identity writes atomic;
external RPC reads finish before that synchronous transaction.

Validation covers insufficient balance, concurrent imports/new allocations,
preexisting signature overlap, immutable nonce/program/terms, expired signatures,
transaction rollback, lost replies, lost task saves, original-wallet retention,
unchanged acceptance deadlines, exact finalized release and admin access controls.
The new import regression is also run with the source change removed to witness
its failure before restoration. A second negative control omits the permanent
obligation link: expired debt is then pruned, and the expected ten-USDC total
incorrectly becomes four USDC. Restoring the link preserves all ten USDC.

Unsigned-reward validation also covers shortfalls before issuance, retained-wallet
recovery, later signing counted once, pending wallet resolution, and imports racing
both signer preparation and an already-running signing attempt. Acceptance and
payment deadlines remain unchanged.

Removing the imported-issuance capacity check allows a six-USDC signature while
twelve USDC is held against ten; the regression detects that authorization and
passes after the check is restored.


## Private funding-gap inventory

The existing authenticated funding report now separates accepted manual-payment
terms from signed-authorization terms. The manual total and the subset without a
payment report overlap the gross accepted-work total; a reported transaction is
not a verified payment and does not reduce exposure. This does not import manual
obligations into the allocation coordinator or release them.

Accrued credit is read directly from the bounded `credit:` prefix using the existing
KV list/bulk helpers. The scan cap is `CREDIT_INVENTORY_SCAN_CAP` in
`src/services/credit-inventory.ts`. It retains integer atomic amounts and formats
USDC without floating-point rounding. No wallet, claim identifier or storage error
is rendered. The report shows its read time, listed/valid record counts, truncation
and fixed gap categories. Missing, invalid or unreadable rows and unfinished scans
suppress the complete credit total while preserving explicitly partial observations.
The existing outstanding aggregate is not substituted for missing records.

Opening this page never calls the expiry-writing balance reader, expires credit,
signs an authorization or sends a payment. Idle-expiry-due stored balances stay in
the observed total, with the expiry subset shown separately. The existing idle
period comes from `CREDIT_IDLE_EXPIRY_DAYS`; the report uses one injected observation
time. Claim markers are counted only as markers. They can survive signing, and a
zeroed credit record cannot tell this report whether an authorization was redeemed.

The credit view is separate from reward exposure and from shared wallet holds.
Those observations are non-atomic, eventual and potentially overlapping; adding
them would imply an assurance this instrument cannot provide. Credit accrual is
still outside the coordinator. External spenders and earlier other-program debt
remain unaccounted for by this change. No full liability or spendable balance is
published, and no cap or payment term changes.

Validation covers idle-boundary handling, dust and large integer amounts, claim
markers, invalid/missing records, truncation, storage failure and the existing admin
gate. The new manual breakdown and rendered credit regressions fail against the
previous source and pass when the changes are restored.
