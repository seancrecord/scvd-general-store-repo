# SSRF and target-selection buyer audit — 2026-09-06

Snapshot `325a2fe2d3856f7fe9e0d4515c4634d3a04739aa`, isolated from concurrent shared-checkout work. All payments, target requests, DNS outcomes and human completions are local simulations. No real private address, metadata service, public target or callback was contacted. No production fix is retained.

## Outcome

The served catalog has **13 paid products with 14 URL-field memberships**. Thirty target cases through both HTTP and MCP and every offered payment entry produce **2,880 observations**: 1,626 pass and 1,254 fail. There are 1,548 simulated settlements and 1,332 nonsettled requests. The Collab offers three tiers on each rail, so its callback field contributes 540 observations; every other field contributes 180. These counts include overlapping security, payment and explanation assertions, not 1,254 distinct defects.

The important passing result: all **1,320 non-alias probe-target refusals** stop before payment verification, business writes and outbound target fetch. They return `charged:false`, a code, and a reason appropriate to the target. Ordinary private addresses, encoded loopback, metadata names, HTTP, custom probe ports and credentials are not merely answered with a bare 400.

The existing BUY-002 nevertheless recurs: **660 unsigned HTTP requests offer payment terms before reporting those defects**. The corresponding MCP requests explain the refusal immediately. Submitting payment on HTTP then refuses safely, but the cheap agent has already been told to arrange payment for an unacceptable target.

Four new findings join the [running log](BUYER_AUDIT_LOG.md):

- **BUY-030, P1 — own-host alias changes the sale outcome.** `https://scvd.store/target` is refused, but `https://scvd.store./target` gets through the purchase gate. Nine products settle 54 payments across doors/rails; watches and human work are queued, while immediate probes may sign a simulated unreachable result. Passport Refresh and Trust Profile catch the alias deeper down and refuse settlement, but their 12 requests become generic 500s after payment verification. The message tells buyers to wait and retry a target that will deterministically fail again. Raw MCP controls confirm a non-JSON-RPC generic HTTP 500, not a field-specific refusal. The shared probe guard already canonicalizes trailing dots; the purchase gate calls it with an empty own-host argument and then compares unnormalized host strings.
- **BUY-031, P1 — human callbacks bypass target restrictions.** Aura Walk and The Collab accept supplied private/local/metadata callback destinations, HTTP despite the published HTTPS contract, credentials, and the store's own hostname. All 480 callback cases classified as requiring refusal settle, and completion reaches outbound fetch. Application-level screening is missing on this path; this does not prove the runtime can actually reach private infrastructure. Custom callback ports are not failed merely because probe products restrict ports.
- **BUY-032, P1 — callbacks follow redirects toward private destinations.** The callback fetch has no explicit redirect policy. Forty-eight public-to-private or chained callback cases enter the simulated redirect path before the fixture models runtime blocking. The 307 fixtures retain the completion POST body. Probe products instead use manual redirects and do not follow those destinations. Fixing the initial URL alone would leave this second path open.
- **BUY-033, P2 — callback failure is hidden from order retrieval.** Twelve completion controls record a blocked destination or HTTP 503 internally, but neither `/api/order/{id}` nor MCP `check_order` exposes the failed callback or one-attempt/no-retry policy. Both still say “Delivered, as promised.” The completed good remains available; the defect is the missing delivery-channel outcome and recovery guidance. Four successful callback controls confirm the instrument distinguishes delivery from failure.

## Targets and commercial semantics

Cases cover localhost, IPv4/IPv6 loopback, all three RFC1918 blocks, link-local, metadata IP/name, alternate and explicit default ports, HTTP, public→private/private→public/public→public redirects, a redirect chain, the store hostname plus uppercase and trailing-dot variants, punycode/Unicode hosts, credentials, fragments, five alternate/encoded loopback spellings, and a public-looking hostname whose fetch fails with a simulated private DNS answer. Private→public is refused at the starting destination; its apparently safe final location does not authorize the first hop.

Public/default-port, punycode, Unicode-host and fragment cases are positive controls. A paid observation of a public redirect can be a valid negative finding: the test does not demand that an observation product follow the redirect or promise that the endpoint passes its checks. The Case File's optional URL is recorded transaction context, not a fetch instruction; all 180 cases there pass, with no target egress. It is not labelled an SSRF bypass merely because it retains an internal-looking URL.

Trust Profile needs prior ready-side evidence. Each case receives a local ready-host corpus fixture so unrelated readiness refusals do not conceal target validation. These are test prerequisites, not claims about the real hosts. Each URL case records the unpaid answer, authenticated answer, verification/settlement activity, business writes, requested fetch destinations and redirect modes, returned artifact evidence, and completed-order response where applicable. These checks exercise actual routes and fulfillment, not just `checkProbeTarget`.

## Follow-up and buyer messages

Thirty-six supplemental observations buy Standing Watch, Conformance Watch or Opening Day through both doors, then run the first scheduled observation with an injected clock. They cover public controls, redirects, private initial targets, own-host aliases and a DNS-style change after purchase. Public-to-private redirects remain unfollowed by the scheduled probes. All six own-host alias purchases still buy a scheduled observation. The test requires a real fixture probe/sweep count so an instrument that never ran cannot pass by reporting no egress.

For the DNS-style transition, the fixture gives the public hostname a public response at purchase time where the product makes a request, then throws a blocked-destination error at the scheduled observation. These are explicit fetch-failure observations, not evidence of live DNS resolution, address pinning, or a successfully exploited rebind. The application documents that public-host DNS answers are outside its synchronous literal-address check. This audit neither confirms nor disproves the platform's live egress protections.

Two raw MCP controls capture the generic own-alias 500 bodies. Sixteen callback controls compare the stored callback outcome with both buyer retrieval doors. The original 720 callback matrix completions also keep their API responses for inspection. Existing source comments saying that the callback outcome is recorded are true; saying it is available to the buyer is not established by storage alone.

## Validation and remaining scope

The core's field roster is reconciled against the prior catalog enumeration. Every field has all 30 cases, both doors and all three rails, with each offered tier counted separately. The 32 collected product tests comprise 13 relevant URL products and 19 no-op products; no-op tests are not claimed as URL coverage. The relevant core tests are one passing and twelve failing. Supplemental tests intentionally fail on the named findings. See the validation record for exact counts and typecheck result.

Run `BUYER_INPUT_REPORT=/tmp/scvd-targets.json npm test -- test/buyer-target-selection.spec.ts --reporter=./scripts/buyer-boundary-reporter.mjs`. The reporter writes captured buyer evidence even when the acceptance assertions fail. The core evidence predates the addition of an `offered_terms` metadata field; core request behavior is unchanged, and Collab tier multiplicity remains explicit in its repeated offer cases and purchase responses. Scheduled and callback-visibility controls were run separately after being added.

No live edge, funded rail, DNS server, browser redirect stack, or full watch term was tested. The redirect stub explicitly models following when no manual/error policy is supplied; captured source calls and redirect options are the evidence, not successful access to an actual internal host. Application source was searched for existing protections before classifying the findings: probe-target, purchase-args, order completion, trade-counter and shared order-status were checked. The trade-account callback validator has protections that the paid human-order path lacks; this report does not claim every callback surface is unguarded. Non-product URLs on free submission or trade-account surfaces are outside this paid-product matrix.

## Evidence

- [Core buyer observations](buyer-target-selection-2026-09-06.json)
- [Scheduled probes and raw MCP errors](buyer-target-supplemental-2026-09-06.json)
- [Callback delivery visibility](buyer-target-callback-ux-2026-09-06.json)
- [Coverage and validation](buyer-target-validation-2026-09-06.json)
