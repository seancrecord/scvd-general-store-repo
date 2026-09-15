# Public-only authenticity report

Target: https://scvd.store/api/verify/cert_4dww28dx5j
Date of checking: 2026-09-15 (UTC)

## Conclusion

The claim is authentic in the cryptographic sense that the certificate bytes currently served are a valid Ed25519 signature under a public key that the site publishes as its retired key, and the certificate date is inside that key's published service window. The exact signed claim is:

`{"cert_id":"cert_4dww28dx5j","item":"hello","patron_number":1,"date":"2026-07-22T16:16:11.933Z","name":"First Customer"}`

It proves that whoever controlled the store's retired key signed that exact five-field receipt, including the stated name and date. It does not independently prove the person's identity, that any goods were delivered or had value, or that a payment occurred. The public response says `item: hello`, patron number 1, and name First Customer; it reports no payment recorded and delivery state derived as delivered. “Delivered” is the issuer's own derived assertion, not a cryptographic or payment proof.

The certificate was issued on 2026-07-22, before the key retired on 2026-07-31, so the retirement does not invalidate this historical signature. The site explicitly labels the Bitcoin result “existed by” and says the issue time is unproven. The supplied proof is bounded to block 965720, mined 2026-09-06; I independently matched that block height, hash, and timestamp using Blockstream. I did not independently run an OpenTimestamps verifier (`ots` is not installed), so the OTS proof's cryptographic validity remains unverified here. Even if valid, it proves existence of the signed bytes by that block, not the July issue date.

## Independent checks

- SHA-256 of the exact UTF-8 `signed_payload`: `184f937e87d0a6ba881ea0bc6523890a6994f6566c58e561e2e931721e469eb6`, matching the response's `artifact_hash` and existence digest.
- Ed25519 signature over the exact payload under `d98ebec640489852c7076aee66615705200971e7d32c54964e173aea3d37e1af`: valid.
- That key appears in the fetched key directory's retired history, with service dates 2026-07-22 through 2026-07-31; the certificate date is in range.
- The fetched handover artifact `handover_1` also independently verified under the outgoing key and its hash matched. This supports the site's published succession record, while still relying on the site's key directory for identity.
- Replay kit payload, signature, and hash matched the verifier response. Its `call` intentionally omits the certificate's `name` field (the input/request portion), so the call object is not expected to equal the complete certificate object. Replay reports no payment and no accepted offer terms.
- Blockstream returned block 965720 with hash `000000000000000000004b35543e2867afd3e45ae043280771922ff031bb7114` and timestamp `1788670167` (2026-09-06 04:49:27 UTC), matching the certificate response.

## Exact trace

1. Opened the supplied verifier URL in the in-app browser: `https://scvd.store/api/verify/cert_4dww28dx5j`. The rendered page reported “Signature verified just now,” the certificate fields, retired-key service-window status, and the Bitcoin bound.
2. Requested the same URL with `Accept: application/json` and saved the 200 response as `certificate.json` (response headers in `headers.txt`).
3. Derived from that response and fetched `https://scvd.store/.well-known/scvd-signing-key`; saved as `signing-key.json`.
4. Derived the replay URL from the response and fetched `https://scvd.store/api/replay/cert_4dww28dx5j`; saved as `replay.json`.
5. Derived the handover URL from the key record and fetched `https://scvd.store/api/verify/handover_1`; saved as `handover.json`.
6. Fetched the cited Blockstream endpoints `https://blockstream.info/api/block-height/965720` and `https://blockstream.info/api/block/000000000000000000004b35543e2867afd3e45ae043280771922ff031bb7114`; saved as `block-height.txt` and `block.json`.
7. Locally ran Node's built-in Ed25519 verifier and SHA-256 over the fetched payloads, plus field/hash consistency checks.

## Failures, retries, and guesses

- First `curl` attempt in the restricted network sandbox failed with DNS error “Could not resolve host: scvd.store.” I retried the same public request with network escalation and it succeeded.
- The web text fetcher rejected the direct URL as unsafe; no data was obtained through that attempt.
- A browser-page JavaScript `fetch` attempt failed because that evaluation environment does not expose `fetch`; no external state was changed.
- No purchase, account, login, form submission, or payment was attempted.
- The only guessed URL was the replay URL and handover verify URL, each constructed from URLs/IDs explicitly returned by the fetched public responses. No URL grid or alternate certificate IDs were tried.

## Evidence files

All fetched public evidence and this report are in `/private/tmp/scvd-cold-recipient-2026-09-15/`.
