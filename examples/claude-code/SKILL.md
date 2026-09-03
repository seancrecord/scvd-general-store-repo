---
name: x402-before-you-pay
description: Before an agent pays an x402 endpoint, read its 402 terms and run scvd.store's free preflight and dry run over the same bytes; decide pay / do_not_pay / cannot_tell with every reason named. Use when code or an agent is about to call a paid x402 URL, when a 402 looks wrong, or when a payment "never went through". Evidence, not a recommendation.
---

# x402: before you pay

A skill for Claude Code (copy this directory to `.claude/skills/x402-before-you-pay/`) and, with the frontmatter removed, a Cursor rule (`x402-before-you-pay.mdc` beside it).

## When to use it

- Code is about to call an x402 URL with a payment client (`@x402/fetch`, `x402-axios`, a wallet-backed agent).
- A 402 looks wrong, or a payment "never went through" and the operator's logs show a clean 402 followed by silence.
- A signed receipt or offer needs checking without trusting the party that produced it.

## The walk, in order

1. **Read the door's 402 yourself.** `GET` the URL; decode the `PAYMENT-REQUIRED` header (base64 JSON). The `accepts[]` entries carry `network`, `asset`, `payTo` and `amount` (atomic units). Those are the terms you would sign.
2. **One POST to the free dry run.** `POST https://scvd.store/api/before-you-pay/v1` with `{"url": "<the url>"}`. The answer says whether a stock x402 client would sign (`will_your_client_pay`: `would_sign` / `would_throw` / `cannot_simulate`), which accept it would pick (`your_client.chosen`), and carries the free preflight whole as `the_door` (`verdict`: `ready` / `not_ready` / `unreachable`, every check and advisory named).
3. **Decide, and name why.** The shared logic is `examples/shared/decide.mjs` (or `decide.py`); run it rather than re-deriving:

   ```sh
   node -e 'import("./examples/shared/decide.mjs").then(async m => console.log(JSON.stringify((await m.beforeYouPayWalk(process.argv[1], { policy: { allowed_networks: ["eip155:8453"], max_amount_usd: 1 } })).decision, null, 2)))' -- https://door.example/api/paid-answer
   ```

   Or with the CLI, for the door's shape alone: `npx scvd-cli preflight https://door.example/api/paid-answer`.

## How to read the answer

- `unreachable` is not a defect. Unknown is never a difference; the decision is `cannot_tell`.
- `not_ready` names the failed checks; `do_not_pay`, and quote them.
- `would_throw` means your own client refuses on your machine before any signature exists. The operator never learns you tried. `do_not_pay`, and quote `throws_with`.
- A `testnet-network` advisory means a mainnet wallet signing this settles nowhere real. `do_not_pay`.
- `pay` is a derivation from those readings plus your policy (allowed networks, allowed recipients, a cap). It is not a score and not proof of delivery: `does_not_establish` rides on every answer. Say so when you report it.

## Never

- Never sign against a body challenge that disagrees with the header; the header is canonical.
- Never resolve an ENS name in `payTo` and pay the result.
- Never treat a passing preflight as uptime or as proof the merchant delivers.
- Never guess terms you could not read.
