# Wrong-good audit — September 6, 2026

The new suite defines a commercial assertion for every catalog product and asks whether a recipient can prove the purchased subject from the delivered evidence. It finds four new proof gaps and reproduces the existing wrong-claim defect.

Audited revision: `325a2fe2d3856f7fe9e0d4515c4634d3a04739aa`, frozen in an isolated worktree. Findings do not establish the state of concurrent changes in the shared checkout. Production files remain unchanged; no real payment, live human order, or external callback occurred.

## Results

- **BUY-005 reproduced:** six fresh paid case files with corrected claims return the old signed claim. These are actual wrong-input goods in the local reproduction, not merely missing signature coverage.
- **BUY-022:** twelve blessings/fortunes do not bind the actual delivered words to the signed receipt.
- **BUY-023:** six confession purchases give the buyer no verifiable evidence of which submission was heard. Private retention is not recipient proof. The existing product promises anonymous storage and a signed absolution; this audit deliberately imposes a stronger subject-proof requirement. Any repair must preserve privacy.
- **BUY-024:** thirty term purchases leave commission subjects, service identities or expiry outside the relevant signed proof: standing_watch, conformance_watch, opening_day, operator_statement and recurring_patronage. Opening Day's launch observation is signed correctly. Future probe/pass signatures and patronage's signed monthly note are real; they do not bind the complete purchased commission at purchase time.
- **BUY-025:** twelve completed human fixtures correctly return work containing the submitted brief, but the brief, target and completion are not bound into recipient-verifiable purchase evidence. This is a proof gap, not an observed human submitting unrelated work.

The certificate's `saw` field hashes the catalog and input schema, not the buyer's actual request or the delivered work. A valid payment certificate therefore cannot, by itself, close these gaps. The full [running fix log](BUYER_AUDIT_LOG.md) describes the repair for each finding.

## What passed

All 32 products ran through HTTP and a matching MCP shelf on Base, Polygon and Solana: 192 primary purchase observations. The assertions accept exact subjects inside independently signed observations, inside the signed certificate, or inside observation bytes whose independently computed SHA-256 is bound by that certificate. They do not count private KV storage or an unsigned echo as proof. Each signature is checked with WebCrypto against the store key retrieved independently from the local key-discovery route.

URL products preserve the supplied path and query in their signed records. Spot Check is explicitly host-scoped; it is not tested as a URL probe. Provenance preserves its requested address. Mandates, wallet statements and first case-file claims preserve their asserted subjects. The context anchor retains a multiline summary with `vector<int>`, accented text and a Unicode symbol exactly, with an independently valid anchor signature. Bitcoin's returned digest matches the purchased digest and signed `attests` field; its returned proof record contains that digest too. This does not establish a Bitcoin inclusion proof while the record is pending or failed.

Six controlled settlement observations locate their subject on Base, Polygon or Solana while all six purchases pay over Polygon. The signed subject transaction and chain match the injected chain facts. These are local RPC fixtures, not claims about real transaction finality. The product payment rail and the subject chain are checked separately.

Bundles contain each requested transaction exactly once, including reversed request order. Exact and case-varied duplicate requests explicitly refuse before simulated settlement. Individual signatures and the certificate's comma-joined digest bind the delivered sequence; the response documents this delivery-order binding. The input schema does not explicitly promise positional order, so the test records observed input-order preservation without inventing a missing-documentation defect.

The four products affected by BUY-006 can still prove their content through the certificate-bound digest. This suite accepts that valid proof path; it does not pretend their broken standalone signature was fixed.

## Hostile-recipient controls

The detector accepts the original signed service audit, rejects an edited target URL, rejects an edited-and-rehashed artifact without a new signature, and rejects a different genuine signed purchase when offered as proof of the original URL. The latter still has a valid signature: the expected subject is what makes it fail. This checks the instrument rather than equating signature validity with the right good.

The final run records **221 observations: 155 passing and 66 failing**. The 37 tests finish **26 passing and 11 intentionally failing**, with all observations retained before assertions. Typecheck passes. No production correction was made; these acceptance tests remain red for the open findings.

Human fixtures complete through the actual admin route and retrieve the resulting order. They test exact correspondence and available proof, not whether a real human's research meets the product's substantive quality bar. Future-service assertions cover the initial commission; full multi-day fulfillment remains outside this run. Private keys, production secrets, chain spending, full SDK verification and economic finality are not part of this suite.

Files: `test/buyer-wrong-good.spec.ts`, [full evidence](buyer-wrong-good-2026-09-06.json), [validation](buyer-wrong-good-validation-2026-09-06.json).

## Commercial assertions by product

- **spot_check:** A signed observation of the exact host, including an honest not-observed result.
- **settlement_attestation:** A signed observation identifying the exact transaction and the chains actually checked.
- **small_blessing:** A blessing whose actual words are verifiable as the store's good.
- **settlement_reconciliation:** A signed reconciliation of the exact transaction and declared cap.
- **daily_fortune:** A dated fortune whose actual words are verifiable as the store's good.
- **the_confession:** A private receipt proving the exact confession was heard, without publishing it.
- **attestation_bundle:** Exactly one independently signed observation per requested transaction, no extras, in documented order.
- **the_mandate:** Signed verbatim mandate and claimed authorization terms.
- **the_case_file:** Signed case for the requested transaction and claim, with linked evidence and explicit gaps.
- **hello:** Signed proof of a successful purchase for this named buyer.
- **good_buyer:** Signed reading of the exact endpoint and buyer's spending constraints.
- **signature_agent_card:** Signed observation of the exact supplied directory URL.
- **the_statement:** Signed transfers for the exact wallet, subject network and requested window.
- **luckies:** An accessible signed lucky record tied to this purchase.
- **coffees_for_closers:** Signed acknowledgement of the buyer's exact win.
- **bitcoin_anchor:** The purchased digest, signed and identical in the retrievable anchor record, with truthful pending/failed state.
- **context_anchor:** An independently signed restore point containing the exact intended summary.
- **passport_refresh:** Signed refresh of the exact requested endpoint.
- **graffiti_on_a_train:** A signed record of the exact purchased tag.
- **standing_watch:** A verifiable commission identifying the exact URL and purchased observation term.
- **service_audit:** Signed audit of the exact URL, with observed limits.
- **conformance_watch:** A verifiable commission identifying the exact URL and purchased observation term.
- **onpage_audit:** Signed on-page audit of the exact URL.
- **launch_check:** Signed purchase attempt against the exact endpoint, including an honest refusal.
- **opening_day:** Signed launch observation and verifiable watch commission for the same exact URL.
- **provenance_check:** Signed observation of the exact address.
- **recurring_patronage:** Verifiable pass identity and expiry, plus accessible signed monthly note.
- **trust_profile:** Signed commission for the exact endpoint and hosted term.
- **operator_statement:** Verifiable commission for the requested wallet, network and term.
- **certificate_of_patronage:** Signed patronage purchase for this named buyer, with no invented entitlement.
- **aura_walk:** Completed work corresponding to the exact submitted detail and URL, verifiably bound to that commission.
- **the_collab:** Completed work corresponding to the exact submitted detail, verifiably bound to that commission.
