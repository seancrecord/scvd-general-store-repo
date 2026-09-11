# Buyer text and human-work evidence

New purchases of Small Blessing and Daily Fortune return `purchased_text` beside the existing purchase certificate. New human orders return `commission`; completed orders return `completion_proof` through their order URL, `check_order`, and completion callback. Original retained purchases keep their original evidence, including a missing envelope on older goods.

Each envelope has `signed_payload`, `signature`, `public_key`, and `signature_covers`. Verify the ed25519 signature against the exact UTF-8 bytes of `signed_payload`, then parse that RFC 8785 JSON. Check the signing key against the store's published key history; a valid signature under a caller-invented key does not identify the store. Also verify the purchase certificate and match its `cert_id` to the statement. Verification needs no payment.

The `scvd.purchased-text.v1` statement binds `item_id`, `cert_id`, and the exact `deliverable`; Daily Fortune also binds `fortune_date`. Compare these values to the goods you received. A purchase certificate by itself does not cover the separate text.

The `scvd.human-commission.v1` statement binds the order, certificate, item, acceptance time, promised window, paid amount and tip. It commits to the accepted brief and target using `inputs_sha256`: SHA-256 of the UTF-8 RFC 8785 JSON object `{detail,target_url}`. Use the exact accepted strings; absent fields are `null`. The envelope contains the digest, not the private brief. A digest is not encryption and can be checked against guesses.

The `scvd.human-completion.v1` statement binds the same identities and input digest to `completed_at`, the SHA-256 of the exact UTF-8 deliverable, and `commission_sha256`, the SHA-256 of the commission's exact `signed_payload` bytes. Check each digest yourself. A changed accepted brief is refused at completion, and a signing failure leaves the order unfinished. Managed orders publish completion text and its proof together, including when completions overlap.

Older orders without a surviving acceptance signature use `acceptance_basis: "retained_order_without_acceptance_signature"` and `commission_sha256: null`. Their completion proves the retained inputs at completion time; it does not assert that an acceptance signature existed earlier. Existing completed goods are never rewritten to add proof retroactively. These signatures establish correspondence, not the quality of human work.

## Accepted input

Published string limits count Unicode code points. Valid buyer text survives intact, including markup, line breaks and surrounding whitespace; renderers escape it where it is displayed. Names clipped on a badge end at a grapheme boundary. Over-limit text, NUL and unpaired Unicode surrogates receive an explicit field refusal before payment. Identifier and URL canonicalization follow their existing contracts.

Optional observation constraints may be omitted. If supplied, payer/recipient identifiers must fit the transaction family, EVM nonces must be bytes32, and amounts/caps must be complete finite decimal values in the documented range. A supplied payment payload must contain a readable nonce consistent with any explicit nonce. Good Buyer's zero client cap and explicit `"false"` spend-control declaration are retained. Invalid values never silently widen a paid observation.
