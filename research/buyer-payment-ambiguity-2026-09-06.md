# Buyer payment ambiguity and retry audit — September 6, 2026

Audit of `325a2fe2d3856f7fe9e0d4515c4634d3a04739aa`, using the isolated buyer-audit worktree. Concurrent shared-checkout changes are not covered. Production fixes remain queued in [the running log](BUYER_AUDIT_LOG.md). No deployment, real payment or external message was made.

## Result

116 cases over the one-cent Daily Fortune, HTTP and MCP `buy_small_pleasure`, and Base, Polygon and Solana payment rails. The MCP shelf is selected from discovery because it declares the purpose field; the separate first-tool schema defect remains BUY-010. The cross-item target is The Confession, independently selected at the same price. There are 36 successful original-purchase recoveries, eight safe changed-request refusals, six intentional-new-purchase controls, and 66 acceptance failures. These counts are observations, not unique defects. Both aggregate door tests deliberately fail.

Four findings are added:

- **BUY-014, P1:** an already-spent EVM payment with no key or a replacement key gets a refusal instead of its receipt. Eight cases. The guard prevents a second debit, but does not answer where the original artifact is.
- **BUY-015, P1:** expiry prevents the identical authorization reaching the purchase cache. More seriously, following the returned suggestion to replace the key and sign again creates another purchase. Four EVM instruction-following cases produced two simulated debits and two certificates. A fresh authorization with the original key recovers safely.
- **BUY-016, P1:** concurrent fresh authorizations with one purchase key both settle. Six cases across both doors and all rails. The cache does not atomically claim the intent.
- **BUY-017, SEV-1 in the injected fault:** a landed transfer whose facilitator acknowledgement disappears can leave no stored certificate, while the response says “No charge.” Six EVM cases, including Polygon with chain evidence available to the fixture. This is not a verified live payment incident.

**BUY-007 is extended:** Solana rebroadcasts return new certificates instead of the original purchase. Rebroadcasting the same simulated transaction counts as one debit. Sending a fresh transaction with the same key can produce a second debit, a different failure. Four changed-input/item replays also issue a new certificate against the original Solana transaction. BUY-011 remains visible in MCP failure envelopes.

## Faults and controls

Each case starts from clean local storage, a fresh quote, a unique purpose and a caller-owned idempotency key. The test uses the public HTTP purchase route or MCP tools/call, real fulfillment, certificate retrieval and the local payment fixture. The initial server response is retained as an oracle even when the modeled client never receives it.

The client timeout fires while the request is held just before settlement. The connection-reset case holds it after simulated settlement and before acknowledgement reaches fulfillment. The client receives an exception; the local Worker is allowed to finish, then the buyer retries. The dropped-body case exercises a stream read failure and discards the first body. These are deterministic application-boundary fault simulations, not real TCP faults or proof that a production Worker survives termination.

The matrix covers identical payment with absent/same/new keys; fresh payment with same key; intentional fresh payment with new key; concurrent identical payments; concurrent fresh payments with the same key; ten-second, one-minute and ten-minute replays; another item at the same price; changed purpose; a verifier that rejects spent authorizations; and lost facilitator acknowledgements with unavailable or visible chain evidence.

For the concurrency cases, a barrier holds both requests at settlement before either can publish a cached result. This tests a possible interleaving deterministically. The simulated ledger enforces one debit per EVM nonce or Solana transaction, separately from the number of settlement attempts. The harness's per-request counter/write snapshots overlap during concurrent calls; use the dedicated total attempt count and ledger for those cases.

EVM authorizations expire at the offered signing window. A verifier-policy control rejects already-spent authorizations before the application cache can be reached. That policy is an explicit fixture variant, not an assertion about every live facilitator. Solana transaction bytes are synthetic: ten-minute Solana observations test application replay only, not blockhash expiry or real signature validity.

## Recovery that works—and its limits

Base and Polygon recover the original artifact after the three modeled client-response faults when the buyer keeps the key and the authorization remains acceptable. Ten-second and one-minute repeats work on these rails. Fresh authorization with the original key also works at ten minutes.

For two concurrent copies of one EVM authorization, only one simulated debit occurs. One response contains the good; the losing response does not. A later identical retry retrieves the winner's artifact. This remains an immediate response/UX failure under the requested standard, but is recoverable and is not a duplicate debit. Concurrent fresh authorizations are different: both are independently spendable and both are charged.

The lost-facilitator-acknowledgement control records a transfer in the ledger and replaces the acknowledgement with 502 responses. The default chain view deliberately does not yet expose that event. Base's immediate rescue asks for it but cannot confirm it. When the same event is visible in the positive control, Base rescues and fulfills through both doors. Polygon does not invoke this immediate rescue. The six failing EVM cases have no stored purchase certificate after the identical retry. Solana's successful-rebroadcast fixture can complete delivery after the lost acknowledgement without another simulated debit; this is a fixture-bounded result.

The repository has settlement-unknown recording, later reconciliation, alerts and a wallet-signature Claims door. This audit does not claim those defenses are absent. It also does not claim eventual reconciliation was exercised. Existing mechanisms do not make the immediate no-charge assertion true. Claims can recover existing purchases through a separate authenticated flow; it cannot recover a certificate that has not been created. HTTP's expiry response includes a Claims alternative, while also giving unsafe replacement-key advice.

## Answering the buyer's questions

**Did I pay?** The simulated ledger answers for the test; several buyer responses do not. In particular, a transport failure after settlement is presented as a confirmed no-charge result. A new signature is not a safe answer to that uncertainty.

**What did I buy?** Successful recovery preserves the certificate and deliverable. Solana retries and same-key concurrent fresh authorizations can produce multiple purchase records, so one replay response does not faithfully explain the whole event.

**Can I safely retry?** Retaining the original key matters, and ordinary verification can block an expired or spent authorization before cache retrieval. Replacing the key in response to the current instructions was demonstrated to create another purchase. This is a finding about the implementation under test, not advice to bypass payment verification.

**Where is my artifact?** The test checks returned certificates and stored certificate keys. Some spent-payment refusals omit the original artifact; the lost-acknowledgement EVM cases have none stored. A deterministic receipt/status handle would let the buyer distinguish those states without knowing the store's internals.

## Evidence and validation

See [raw observations](buyer-payment-ambiguity-2026-09-06.json), [validation](buyer-payment-ambiguity-validation-2026-09-06.json), and `test/buyer-payment-ambiguity.spec.ts`. Each row records terms, client-visible fault, first server oracle, recovery and follow-up responses, simulated settlements, certificate keys, verification results and defects.

Run `npm test -- test/buyer-payment-ambiguity.spec.ts --reporter=./scripts/buyer-input-reporter.mjs` with `BUYER_INPUT_REPORT` set to an output path. The tests remain red while the buyer-outcome defects remain.

The complete matrix reproduced the same 116 outcomes on a second run. Typecheck passed. A temporary cache-read bypass turned both formerly successful EVM same-key HTTP recoveries into detected failures; the source was restored byte-for-byte. The full repository suite was not run; no production code is changed.
