# Buyer cross-rail parity audit — September 6, 2026

Audited revision: `325a2fe2d3856f7fe9e0d4515c4634d3a04739aa`, in the isolated buyer-audit worktree. Concurrent shared-checkout changes are not covered. Findings remain queued in [the running log](BUYER_AUDIT_LOG.md); no production fix, deployment, real payment or external message was made.

## Findings

**BUY-018 — P1: cross-rail payer identity is not bound to the verified signer.** Both doors return an EVM payer's cached purchase to a verified Solana signer who supplies an extra EVM-shaped authorization naming that payer, with the same item, arguments and publicly suggested key. The real Solana signature authenticates the transaction, not the adjacent EVM address. The installed SVM facilitator SDK accepts this fixture in Node and returns the actual Solana payer. The store's cache lookup instead uses `payload.authorization.from`.

The separate extra-authorization cases also write EVM nonce records for Solana payments. A top-level nonce alone is ignored. Extra fields may be refused or safely ignored, but must not change the authenticated identity or consume another rail's nonce.

**BUY-019 — P1: a malformed Solana settlement identifier becomes a signed payment fact.** An injected successful settlement response containing `transaction:"0OIl!"` produces a certificate with that value through both doors. `/api/verify` says the certificate is valid. The signature is valid, but the payment reference is neither base58 nor a decoded 64-byte transaction signature. The good exists; its payment reference cannot identify the transfer.

**BUY-007 persists:** 16 canonical Solana duplicate requests return new artifacts instead of the original purchase. The simulator rebroadcasts the same signed transaction and counts one debit; new certificates are not evidence of a second chain debit.

## Coverage and outcomes

116 observations: 48 canonical purchases with duplicate checks, 66 rail-specific cases, and two cross-payer cache attempts. The initial canonical purchases all produce valid registry-verified certificates with matching item, price and payment network. Across the complete audit, 94 observations satisfy their checks and 22 fail. All ten aggregate acceptance tests are red because every product test includes the known Solana replay failure.

The common cheap item is the one-cent Daily Fortune. Representative complex products are Settlement Attestation, Attestation Bundle, Service Audit, Opening Day, Trust Profile, Bitcoin Anchor and Aura Walk. Each runs through HTTP and MCP on Base, Polygon and Solana. Inputs stay semantically the same across payment rails. The chain a product observes is separate from the rail used to pay: buying a Base-transaction observation with Solana is legitimate and is not silently converted into a Solana-subject observation.

Canonical checks compare the served price, integer smallest-unit amount, configured recipient, USDC contract/mint, CAIP network identifier, advertised signing window, verifier result, settlement acknowledgement, certificate fields, transaction identifier, `/api/verify`, and same-key duplicate retrieval. Mint comparisons are case-sensitive on Solana. Prices use the catalog; recipients are configured disposable fixture addresses; expected asset/network identities come from the installed implementation/constants.

For Base and Polygon, the suite covers lowercase and checksum authorization addresses, nonce replay, expired authorization, insufficient USDC, signatures bound to the other chain's USDC domain, malformed signatures, and an original payment presented under the other chain's accept entry. It also exercises transient verification and settlement failures. Valid address casing works; the tested malformed/mismatched payments do not settle. Same-key repeats retrieve the original EVM purchase. The no-key nonce rejection still has the receipt-recovery limitation already logged as BUY-014.

For Solana, it covers a malformed base58 recipient in the accept entry; a signature valid for a different message; wrong mint, destination and amount in signed transfers; pending and failed transaction responses; EVM-shaped authorization metadata; a standalone nonce; verifier and settlement transport failures; a simulated RPC failure followed by successful identical retry; and a malformed base58 transaction ID in a successful settlement response. Pending/failed cases do not book a simulated USDC debit. These are state-response simulations, not observations of real pending or failed mainnet transactions. The earlier ambiguity report remains relevant to how those responses describe money status.

## Stronger payment fixtures

EVM authorizations are signed locally using a disposable private key, the offered USDC domain and chain ID, and EIP-3009 typed fields. Verification checks the signature against the selected offer's domain, recipient, value and expiry. Wrong-chain cases therefore exercise actual cryptographic domain separation instead of merely attaching a failure label to a fake signature.

Solana fixtures contain real locally generated ed25519 signatures, separate buyer and fee-payer keys, associated token-account derivation, compute-budget instructions and a TransferChecked instruction. The recent blockhash, token-account funding and chain state are simulated. These transactions are never submitted.

The companion Node script runs every recorded Solana transaction through the installed `@x402/svm` facilitator scheme with network-capable operations prohibited and account-state simulation stubbed. It checks 44 fixtures: 36 valid transaction/signature shapes and eight deliberately invalid ones, with no disagreement. Envelope matching and settlement response handling are tested separately by the store routes. Actual SDK verification confirms that the extra EVM authorization does not invalidate the Solana transaction; it does not authenticate that extra EVM identity.

The facilitator SDK rejected valid fixtures when embedded inside the local Worker test runtime, while its Node runtime accepted them and rejected the negative control correctly. That diagnostic run is not reported as production protection. The final matrix uses the explicit local verifier model, with independent SDK validation in Node. This separation is recorded rather than allowing a fixture/runtime failure to masquerade as safe behavior.

## Limits

No live balances, chain finality, blockhash lifetime, actual facilitator availability, funded account ownership, broadcast or mainnet settlement was established. Solana's `maxTimeoutSeconds` is not a proof of blockheight expiry. The response-state tests simulate pending/failed transactions rather than running the SDK's complete settlement lifecycle. EVM signature validation is real; account balance, nonce consumption and chain state are simulated. The prior payment-ambiguity audit covers expiry-sensitive receipt recovery and concurrent fresh authorizations more deeply.

The signed malformed-transaction-ID finding deliberately violates the facilitator response contract; it does not claim the live facilitator currently returns malformed identifiers. The payer-boundary finding is reproduced using disposable identities and the SDK verifier, not a real buyer's account. A successful initial complex purchase also does not establish eventual human completion, a full watch term or Bitcoin confirmation. Existing input and standalone artifact-signature defects remain open.

## Reproduction

Run `npm test -- test/buyer-cross-rail.spec.ts --reporter=./scripts/buyer-input-reporter.mjs`, setting `BUYER_INPUT_REPORT` to the output JSON path. Then run `node scripts/buyer-svm-fixture-check.mjs <observations.json> <sdk-validation.json>` to independently check the recorded Solana transactions in Node. All signer operations capable of network submission are prohibited in that companion control.

See [raw observations](buyer-cross-rail-2026-09-06.json), [SDK verification](buyer-cross-rail-sdk-validation-2026-09-06.json), and [validation record](buyer-cross-rail-validation-2026-09-06.json).

The repeated matrix reproduced the same 116 outcomes. Typecheck passed. Both cross-payer tests fail on the audited source and pass with a temporary rail check in the payer helper, confirming the cause. That source change was restored byte-for-byte; it is not a retained production fix. The full repository suite was not run.
