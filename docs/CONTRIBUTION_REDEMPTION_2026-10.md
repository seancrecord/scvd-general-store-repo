# Contribution redemption and the next QA brief

October 15, 2026. Implemented on `codex/contribution-redemption-readiness`;
release and real signing remain unverified until the normal release checks.

## Decision and evidence

The keeper explicitly declined paying gas. A private inbound conditional
QA offer described manual domain-pointer arrival, empty boards, and a
self-reported inability to fund redemption gas. Public reads confirmed the
empty contribution and shopping boards. This is a concrete offer of labor,
not an accepted assignment, verified work quality, search referral, unique
visitor count, customer purchase or verified wallet balance. The private
letter is not republished. No reply or external message was sent.

## Built

New browser-posted briefs use signed Base USDC authorizations. Acceptance
and authorization remain separate keeper decisions. A durable intent fixes
nonce, amount, recipient, signer and expiry before external screening/signing.
Concurrent/repeated presses return the stored authorization, never a new
reward. Failed saves return fixed errors; no signature is released first.
External calls do not hold a global lock, and the state is reread before
saving so notes and retention updates survive. No new wallet or secret is
introduced. Status exposes signatures only through the private reservation
key; the public brief shows gas and expiry requirements before reservation.

Legacy manual-payment briefs keep their original terms. The first-round
launcher refuses if the original round exists, otherwise uses distinct
signed-authorization ids. The separate editable six-USDC QA proposal defines
twelve GET cases, bounded retries/time and acceptance of correct behavior or
honest blocks. Both drafts together propose $16 maximum rewards. Nothing is
posted, signed, redeemed or sent by deploying these changes.

The admin page shows the existing program caps and page-scoped contribution
commitments, with overlapping amounts and unknown redemption explicit. A
point-in-time wallet balance is not proof all obligations are covered. No
aggregate contribution funding cap or shared-wallet reservation is claimed.

## Caps and further implications

The near-term issue is available work, not evidence that current weekly caps
are exhausted. Keep shopping and study limits separate from contribution
commitments. Proposed next experiment: a $25 one-time contribution envelope,
including the $16 prepared work, leaving $9 for one targeted follow-up. This
is a proposal, not an active cap, authorization to spend, or an enforced
software limit. Before another round, review useful outputs, real review time,
accepted obligations and verified redemptions. Raising a reward cap alone
cannot solve empty tasks, gas readiness or a lack of reviewer capacity.

The next funding-control build should coordinate outstanding authorizations
and accepted obligations across programs before any automatic cap increase.
Do not claim the current page or wallet check already does that. Expired
contribution authorizations need deliberate reconciliation rather than
silent reissue; that recovery workflow remains separate work.

Manual pointers are a distinct discovery path. The optional existing arrival
answer now asks for the upstream public source when known. A pointer may come
from a human, directory, saved instructions or another agent; none is inferred
from this letter. No private prompts are requested or copied publicly.

No-purchase work still has compute, time and redemption prerequisites. State
them before reservation. Keep accepted work, issued authorization, redeemed
reward and net earnings distinct. Reward reviewable work, not defects or
endorsements; optional human handoffs remain independent of reward eligibility.

## Validation

The initial payment-method and issuance regressions failed against the original
source. The final focused run passed 173 tests across 13 files, including real
test-signature verification, retry/concurrency, interrupted persistence,
screening and balance failures, wallet changes, private access and legacy terms.
Typechecking and deployment bundle checks passed. The changed guide fingerprint
was reviewed after its original baseline passed. Full CI remains the merge gate;
no production reward was signed and no manual browser rehearsal was required.
