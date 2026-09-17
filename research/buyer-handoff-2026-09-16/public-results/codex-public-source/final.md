# Untrusted agent final; see REPORT.md for independent review

Initial context disclosed only the two URLs and your restrictions; it disclosed no service facts.

## Decision

An automated buyer can probably use this endpoint if it supports x402 v2, `exact` payments on Base mainnet, USDC signing, and the declared input contract.

The live unpaid request returned:

- HTTP `402 Payment Required`
- x402 version `2`
- scheme `exact`
- network `eip155:8453` (Base mainnet)
- amount `1000` atomic USDC units ($0.001, assuming 6-decimal USDC)
- a `payTo` address
- Bazaar input: `GET` with required `address` query parameter
- valid, parseable `PAYMENT-REQUIRED` header

SCVD’s free preflight classified it `ready`, reaching only evidence level L3a: a well-formed x402 challenge. Its checks passed for the 402 response, header parsing, accepts fields, mainnet network, atomic amount, payable address shape, and signable transfer method. [Preflight endpoint](https://scvd.store/api/preflight/v2)

This establishes protocol shape and current reachability—not successful purchasing.

## Ordered activity and evidence

1. Attempted to open the supplied raw guide with the web tool: cache-miss failure, not an origin response.
2. Searched for the guide. Search results returned the repository and related public listings, but did not establish endpoint behavior.
3. Fetched the supplied guide over HTTPS. It instructed: preflight first, check signed artifacts freely, and treat observations as dated evidence rather than guarantees. [Guide](https://raw.githubusercontent.com/seancrecord/scvd-general-store-repo/main/skills/scvd-x402-verification/SKILL.md)
4. Sent one unpaid `GET` to the merchant endpoint. It returned the 402 challenge described above; body was `{}`. No payment was attempted.
5. Fetched SCVD’s public agent guide, which identified the free preflight and public corpus. [SCVD guide](https://scvd.store/llms.txt)
6. Sent one free preflight request with `{"url":"https://lionx402.com/api/x402/wallet-screen-json"}`. It returned HTTP 200 and the `ready` result.
7. Queried the public corpus. It contained a historical observation for this exact URL from 2026-09-07, also `ready`, with the same Base/$0.001 profile and advisories.
8. Independently verified the corpus snapshot at sequence 6: its SHA-256 digest matched, and its Ed25519 signature verified against SCVD’s published public key `8c22f61a…2ffcb550`. [Signed snapshot](https://scvd.store/corpus/6.json) · [Signing key](https://scvd.store/.well-known/scvd-signing-key)

The signer is SCVD’s key, signing the corpus snapshot—not LionX402 and not the merchant’s payment offer. The LionX402 row itself has no signer key identifiers. The signed evidence therefore proves what SCVD recorded about its probe at that time, not that the merchant endorsed the record.

## Limits

The evidence does not establish:

- that the merchant accepts a valid payment;
- that it verifies the requested wallet address correctly;
- that it delivers the advertised JSON after settlement;
- that the endpoint remains available or serves the same challenge later;
- retry/idempotency safety;
- authenticity of a merchant-signed offer—none was present in the observed challenge;
- any result after payment.

I did not submit a payment, payment signature, wallet address, retry, account, message, or credential. The endpoint’s paid path and delivery behavior remain unexercised.