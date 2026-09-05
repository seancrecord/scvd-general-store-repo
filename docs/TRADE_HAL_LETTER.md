# To Hal — the questions before the account goes live

Drafted 2026-09-03 for the keeper's hand. His to send, edit, or drop;
nothing here is sent by any agent. `TRADE_COUNTER.md` carries the
same ten questions with the engineering reason behind each, and, as
of 2026-09-04, Hal's answers to all ten.

---

Hi —

We've built the listing side. Your contract (provider key, timestamp,
32-hex nonce, `sha256=` HMAC over `timestamp.nonce.body`, five-minute
window, nonces never honoured twice, `/health`, one JSON object back
inside 30 seconds and 1 MiB) is live at

    POST https://scvd.store/api/trade/hal/{item_id}

as a trade account in **test mode**: your signatures verify, real goods
deliver, the certificate says `trade_account_test`, and nothing is
booked to either side until we flip it. Everything about the account
is public — items, share, cap, prices per item — at
https://scvd.store/api/trade/contract, and there's a check desk at
`POST /api/trade/hal/check` that takes exactly the headers and body
you'd send to the order door and reports every signature check by
name, so you can prove your signer against ours before anything is
routed. It works before any secret exists between us: every check
but the HMAC itself runs and is reported, so you can prove your
bytes in your own dialect today. The order door answers 503
`account_not_provisioned` until a secret is set on our side, and your
account row on the contract says `provisioned: false` until then;
the row also carries a `fixture` (one deterministic item and body,
the expected values on the 200, and the response invariants as rows)
for a paused listing. (A sandbox account with a published secret is
on https://scvd.store/trade if you want a full delivery first.)

A few things we need pinned down before it goes live. A couple change
the code rather than the docs, so I'd rather ask than guess:

1. **Settlement mode today.** Is sats/Lightning moving on mainnet, or
   simulated? Same for any USDC payout path your docs mention.
2. **Two secrets or one?** Is `X-Hal-Provider-Key` a separate value
   from the HMAC signing secret, or the same value? If it's the same,
   the header travels in the clear on every call and we'll treat it as
   a label, not a credential — the HMAC is the lock either way.
3. **Timestamp units** on `X-Hal-Timestamp`: unix seconds or
   milliseconds? We refuse anything outside the window in either
   direction, so a wrong unit fails every call rather than some.
4. **Retries.** If a call to us times out at 30s, does your side retry,
   with what backoff, and does the retry carry a fresh nonce? If you
   carry a stable order id, send it as `order_ref` in the body (any
   name you already use is fine, tell us which): a retry with the
   same `order_ref` inside a day returns the original delivery and
   bills nothing twice. Without one, a retry with a fresh nonce is a
   fresh sale.
5. **Nonce slack.** We hold nonces for ten minutes against your
   five-minute window. Any conflict on your side?
6. **Rotation.** When we need to rotate the shared secret, we verify
   against two active secrets for a handover window and say which one
   signed. Does your side support issuing a new one before retiring
   the old?
7. **Egress IPs.** Do you publish a fixed set your calls come from?
   We'd add an allowlist as a second layer, never the only one.
8. **A statement or per-order settlement API.** Each delivery is one
   line on your account's statement here (yours to read, signed, at
   `GET /api/trade/hal/statement`). If your side exposes the same,
   reconciliation is mechanical on both sides rather than trust.
9. **Refunds and clawbacks.** Who refunds your customer, and does a
   refund on your side reverse a statement line here? Our default:
   refunds are yours, the goods were delivered, a line stands unless
   we agree one by hand.
10. **A sandbox on your side**, to match ours, so neither of us tests
    against the other's production.

Pricing, so it's said once: our listed price on your side is the trade
price from the contract — retail plus 20% net of your 5%, rounded up
to the cent — and what you charge above it is yours. It is in US
dollars; we print no sats figure because we hold no exchange rate.
List at your own rate's equivalent at listing time; the statement
bills the USD trade price.

On the secret: your side generates both values when I create the
listing, and I set them here. Until I do, the door answers 503
`account_not_provisioned` by design; after, an unsigned call answers
401, which is the rejection check you want to see first. The certificate
your customer gets verifies against our public key without trusting
either of us; it says the sale settled on a trade account and names
no chain, because none was involved.

Once we have the answers we set your secret, you run a few live calls
against the test account, we both read the ledger, and we flip it.

— Sean
