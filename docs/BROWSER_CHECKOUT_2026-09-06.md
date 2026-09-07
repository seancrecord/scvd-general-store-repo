# Browser checkout — 2026-09-06

The keeper reported a successful purchase through the browser till on
`https://scvd.store/try`, including the delivered blessing and the
expanded till response. This is a user-observed delivery, not an
automated purchase by this coding agent.

- Certificate: `cert_et6zuesrrn`.
- Verify: https://scvd.store/api/verify/cert_et6zuesrrn
- Item: `small_blessing`; amount: $0.005 USDC; patron: 243.
- Certificate time: 2026-09-06T22:48:31.020Z.
- Network: `eip155:8453` (Base).
- Recorded transaction:
  `0x3d88c1dac9d339020cd24bf70d92a8482bd43c6304d9d18a465e2dec6cac0b9b`.
- Delivered text reported by the keeper:
  “May someone read your logs and say, quietly, 'huh, nice.'”

The public verify response was read after the report and returned
`valid: true`, with the certificate fields above. A local Ed25519 check
of the exact `signed_payload` against the response's public key also
passed, and every displayed certificate field matched that payload.
This checks the signature, not independent ownership of the signing key.
The transaction here
is the certificate's recorded settlement; no independent RPC receipt
read was made in this copy-update task. The certificate alone does not
prove which browser UI the buyer used; that part rests on the keeper's
report. Browser name/version and wallet-extension name/version were not
provided with this result and are not inferred from earlier wallet setup.

Separately, this task's Chrome 152 session on the live `/try` page
registered both `quote_store_purchase` and `complete_store_purchase`.
Calling the registered quote tool returned all configured checkout
networks and `payment_sent: false`. Calling the completion tool with
that quote and an empty signed-payment object refused with:
“A signed x402 v2 JSON payload is required. Signing belongs in the
buyer's wallet; no payment was sent.” No wallet was present in that
Chrome session, and no payment was sent by that test.

Still unverified: a buyer-signed payment submitted through the actual
in-page `complete_store_purchase` tool; browser-till purchases on the
other networks; broad wallet-extension compatibility. The separate
`pay.mjs` purchase (`cert_zhkxdvr3sg`) tested an HTTP client and does not
close the in-page completion test.

The keeper's page capture also exposed stale copy: a Base/Polygon-only
browser hint, a “half a cent is cheapest” claim next to a lower-priced
shelf, and chain-count/settlement-order claims that no longer described
the implementation. These are addressed in the payment-copy follow-up;
the successful purchase is not evidence that the old prose was correct.
