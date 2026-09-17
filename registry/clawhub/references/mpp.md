# MPP and mixed-protocol inspection

Use the read-only preflight tool or
`POST https://scvd.store/api/preflight/v1` with the public endpoint URL.
Inspect the actual returned `protocols_spoken` and `mpp` block.

The top-level preflight `verdict` retains its x402 meaning. An MPP-only endpoint
can therefore be `not_ready` for x402 while advertising MPP. Describe the
protocol-specific checks and gaps; do not call the entire endpoint broken
merely because x402 was absent. Conversely, advertising MPP or passing its
challenge-shape checks does not prove that settlement or delivery works.

A passed `mpp-challenge-present` check establishes only that a challenge was
present. It does not establish a valid challenge. Report each named check
within its own scope; unchecked syntax, methods, signatures, authorization,
settlement and delivery remain unverified. Never upgrade presence or
advertisement into protocol validity.

The MPP battery reads a `WWW-Authenticate: Payment` challenge and reports named
checks/advisories. It is unpaid observation, not an MPP payment client. Do not
convert its reading into permission to pay, claim every MPP method is supported,
or infer MPP checkout at this store. Checkout options come from the actual quote.
If the deployed response lacks these fields, report that MPP was not observed
by that instrument; do not invent a result from this reference.

For historical evidence, preserve the fields present in each dated record.
Older records without protocol-specific observations remain unmeasured.
