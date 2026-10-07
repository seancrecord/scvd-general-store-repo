# BiX results reply — posted and verified

Posted with keeper approval: https://github.com/Merit-Systems/x402scan/issues/1197#issuecomment-5874641977

Thanks, Salman — we completed the free unpaid check on September 28.

- Your new OpenAPI and reliability URLs returned 200. The reliability response reports the September 28 13:05:08 UTC profile timestamp and both readiness flags as true.
- At 16:30 UTC, your exact synthetic POST returned 402. The decoded PAYMENT-REQUIRED header matches the response body: x402 v2, Base USDC, exact/EIP-3009, 0.005 USDC, 60-second timeout.
- The synthetic input and Bazaar discovery data validate against their published schemas.

One clarification: your update mentions `HOLD_PAPER`, while OpenAPI allows `PROMOTE`, `HOLD`, or `OBSERVE`. Does the paid response normalize the internal state, or should that enum change? We have not observed a paid response violating it.

Our standard Launch Check also needs a request-body capability before it can preserve your required `pair` and `tax`; that is our instrument limitation. We sent no payment, so settlement, paid output and its freshness remain unverified. We can share the captured responses and offline checks. Would these observations help you confirm or change the public contract?
