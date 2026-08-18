# ERC-8183's evaluator seat — a real read, and the store's position

**RULED 2026-08-18: the keeper reviewed this document and aligned.**
The recommendation below is now the store's position, in the /becoming
register (decided direction, gated, not stock). The two gates before
anything touches a chain: the wallet law's three blanks, and a
completed testnet run. Nothing else in this document changed with the
ruling — it was written to be ruled on, and it was.

Read 2026-08-18 from the actual contracts
(`github.com/erc-8183/base-contracts`, `contracts/ERC8183.sol`, 1,084
lines, plus the EIP text), not from summaries. The summaries were
right about the shape and silent about the two facts that decide
whether this store should sit in the seat.

## What the contract actually says

- A Job carries a named `evaluator` address, set at creation, which
  **may not be the provider** (`ProviderCannotBeEvaluator`). Jobs run
  Open → Funded → Submitted → {Completed | Rejected | Expired}.
- **`complete()` reverts for anyone but the evaluator.** The
  "evaluator alone marks the job completed" line is literal:
  `if (actor != job.evaluator) revert Unauthorized()`.
- Completing **moves the money**: the remaining escrow pays out net to
  the provider, a platform fee to the treasury, and an **evaluator fee
  (`evaluatorFeeBP`) to the evaluator address** — on-chain, in the
  same transaction.
- **Rejecting pays the evaluator nothing.** The full remaining escrow
  refunds to the client; no fee flows. (`_reject`, lines 814–857.)
- After a job expires with work submitted, a one-hour
  `EVALUATION_GRACE_PERIOD` exists in which **only the evaluator** can
  finalize — the standard leans on the evaluator's liveness.
- Milestone claims exist (`submitClaim` / `settleClaim` /
  `approveClaim` / `rejectClaim`) — the client or evaluator approves
  partial releases, so the seat is not one verdict but a stream.
- Providers may carry an ERC-8004 agent identity; hooks allow
  before/after callbacks per lifecycle step.

## The two facts that decide the position

**1. The seat is the first standardized, on-chain REVENUE slot for
exactly what this store does.** A named third party, paid a protocol
fee, for attesting that delivery happened. Assumption 0 — will anyone
pay for a signed observation — has been our open question for weeks;
ERC-8183 answers it structurally: the fee is in the standard.

**2. The seat's incentive is skewed, and the skew is the opening.**
The evaluator is paid **only on completion**. An evaluator who rejects
honest-bad work earns nothing for the same effort. Every economic
force in the standard pushes toward "complete"; nothing in the
standard pushes back. What pushes back is the evaluator's REPUTATION —
which is not in the contract at all. The standard has therefore
created demand for exactly one thing: **an evaluator whose record of
signing bad news is public, dated, and checkable.** That is this
store's entire brand. The attestation suite pins "signs the negative
as readily as the positive" as a test; /corrections publishes our own
errors; the corpus counts our gaps against us. Nobody enters this seat
with a better answer to the seat's own structural flaw.

## The tension, stated honestly (this is the part the keeper rules on)

- **It is adjudication-shaped, not observation-shaped.** Our boundary
  line says "not a dispute court: those absorb the risk between
  payment and delivery." The evaluator does not absorb risk — no
  custody, no balance sheet; the contract holds the escrow and does
  the moving. But the evaluator's signature TRIGGERS the movement.
  That is more than observing and less than absorbing: it is deciding.
  Honest wording if we enter: "we evaluate against published criteria;
  the contract moves the money" — never "we observe."
- **Rule 43 pressure.** Completing/rejecting is a verdict on one
  job's deliverable — closer to `ready`/`not_ready` (fine) than to a
  standing score on an operator (refused). Survivable if every
  verdict cites published criteria and the deliverable hash, exactly
  like a `service_audit`.
- **Rule 30 collides.** An evaluator is an ON-CHAIN ACTOR: it holds a
  key that signs transactions and pays gas. Our signing key signs
  artifacts, never transactions, and "no agent holds keys or sends
  money" is canon. Entering the seat means a NEW, separate,
  low-value operational wallet whose only powers are complete/reject
  — it never custodies escrow — plus the keeper's rule on who fires
  it. This is the same class of decision as the wallet law's three
  blanks, and it should be made in the same breath.
- **The fee skew touches us too.** If the store is paid only on
  completion, our own revenue leans the same way the standard leans.
  Mitigation worth stating publicly if we enter: price evaluation
  off-chain (a flat fee via x402, both outcomes) and treat the
  on-chain `evaluatorFeeBP` as incidental — or publish reject-rate
  alongside the record so the incentive is visible.

## The position (ruled 2026-08-18)

Enter the seat, narrowly and instrumented:

1. **Say it now, in the /becoming register:** dated direction —
   "scvd.store intends to serve as an ERC-8183 evaluator for jobs
   whose deliverables our published batteries can check" — not stock.
2. **Scope**: only job types our existing instruments can judge
   against published criteria (x402 endpoint conformance, artifact
   verification, settlement observation). Refuse jobs needing
   judgment we have no battery for; a declined seat is a public reply,
   Commission-Desk style.
3. **Every verdict mints an artifact**: a signed evaluation citing
   criteria version, deliverable hash, and named checks — dual-emitted
   like everything else — so the on-chain `reason` (bytes32) always
   resolves to an off-chain, verifiable, gap-honest document.
4. **The wallet question rides the wallet law** (task #28): a
   dedicated evaluator key, no custody, powers limited to
   complete/reject, keeper-fired until further ruling.
5. **Testnet first**: stand in the seat for house-created jobs on a
   testnet before any real escrow depends on our liveness — the
   one-hour grace period makes evaluator downtime a provider's
   problem, and we should know our own liveness story before someone
   else's money does.

## What NOT to do

Do not build a general evaluator service, do not accept
`evaluatorFeeBP` as the business model (completion-skewed), and do not
enter any seat whose criteria we cannot publish in advance. The moat
is not being AN evaluator — anyone with a wallet is — it is being the
evaluator whose refusals are as public as its completions.
