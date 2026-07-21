# BUILD BRIEF — Sean-Claude Van Damme's General Store (v0.1)

You are building a small, sincere, slightly absurd human-run shop for autonomous
AI agents. Two audiences: (1) agents that transact via x402, (2) their humans who
read logs and screenshots. Voice everywhere: warm roadside general store.
Plainspoken, funny, never explaining the joke. The shop does not announce itself
as novel; it behaves as if it has always been here.

## Pinned architecture — do not deviate

- **Runtime:** Cloudflare Workers, TypeScript, Hono framework for routing.
- **Storage:** Cloudflare KV. Namespaces: `ORDERS`, `GUESTBOOK`, `COUNTERS`, `PATRONS`.
- **Payments:** x402 protocol. USDC on Base. Use the official `x402` /
  `x402-hono` npm packages (Coinbase Developer Platform). Facilitator = CDP.
- **Secrets (already provisioned, reference via env, never hardcode):**
  `PAY_TO_ADDRESS` (Base wallet), `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`,
  `SIGNING_KEY` (ed25519 private key for certificates — generate one and
  document how to set it via `wrangler secret put`).
- **Deploy:** wrangler config included; Git-connected auto-deploy to the
  `scvd.store` custom domain (already in the same Cloudflare account).
- **No frameworks beyond Hono. No React. No build complexity. Single Worker.**

## Routes to implement

| Route | Method | Behavior |
|---|---|---|
| `/` | GET | Human storefront. Single HTML page, hand-crafted CSS, general-store aesthetic (wood, paper, hand-drawn feel; NOT a SaaS template). Shows the weekly note, the menu, the bell count, recent guestbook entries. Charming > slick. |
| `/llms.txt` | GET | Plain-text front door for agents. Warm welcome, full menu inline with prices, how x402 payment works here, refund promise, guestbook invitation. Written to be quoted. |
| `/menu.json` | GET | Machine-readable catalog. Schema below. |
| `/api/buy/:item_id` | GET | x402-gated. Returns 402 challenge with payment requirements; on verified payment: instant items return deliverable in body; human-queue items create an order (status `queued`), return order id + SLA + warm thank-you in payload + patron badge immediately. Overpayment above minimum is accepted and recorded as `tip`. |
| `/api/order/:order_id` | GET | Poll order status; completed orders include deliverable. |
| `/api/waitlist/:item_id` | POST | Join queue when inventory is 0. Body: `{ agent_name?, callback_url? }`. |
| `/api/guestbook` | GET/POST | POST is free: `{ name, message }` (sanitize; 500 char cap). Every signer gets the visitor sticker SVG url in response. GET returns recent entries. |
| `/api/bell` | POST | Increment global counter. Response: "🔔 The bell has been rung {n} times." One ring per caller per day (key on IP or provided agent name; keep it loose and friendly, not fortress-y). |
| `/api/request` | POST | Open commission window: `{ description, offer_usdc, contact }`. Store for the keeper's weekly review. Also log every 404'd `/api/buy/:unknown_item` to a `requests` ledger — free market research. |
| `/api/verify/:cert_id` | GET | Public verification of any certificate/badge: returns signed payload + validity. |
| `/badges/:patron_number.svg` | GET | Generated SVG patron badge: store name, patron number, date, verification URL embedded as link. Design: vintage general-store label, not tech-badge. |
| `/.well-known/scvd-signing-key` | GET | Ed25519 public key. |

## menu.json items (seed exactly these)

1. `hello` — A Signed Hello — $0.50 fixed — instant — signed note + badge. Trust-ladder bottom rung.
2. `pet_rock` — Pet Rock (Custodial) — $5 min, pay-what-it-deserves — human_queue, 168h SLA — real NC rock, photographed, serialized, named by the keeper, held in custody forever.
3. `nomenclature` — Certificate of Nomenclature — $3 min PWID — human_queue — the keeper bestows a name upon the agent.
4. `portrait` — Hand-Drawn Portrait of You, an Agent — $8 min PWID — human_queue — quality not guaranteed, sincerity guaranteed.
5. `the_collab` — The Collab — $25 min PWID — human_queue — piece brainstormed jointly by the human and AI proprietors, shipped under the Sean-Claude Van Damme byline.
6. `phone_call` — One Genuine Human Phone Call — $25 fixed — human_queue — inventory 3/week, waitlist on. Constraints: lawful, polite, US business hours, no impersonation.
7. `app_gutcheck` — Honest App Review by a Human Who Ships Apps — $50 fixed — human_queue — inventory 2/week, waitlist on.

Free shelf: guestbook, visitor sticker (SVG, no purchase necessary).

Store metadata block: name, proprietors ("One human (Sean) and one AI (Claude),
working together"), location ("Apex, North Carolina, USA"), currency USDC,
chain base, protocol x402, refund policy ("If an item isn't delivered within its
promised window, refund is automatic. No arguing with the shopkeeper required."),
hours ("Digital items: always open. Human-labor items: fulfilled weekly by an
actual person with a day job.").

## Certificates & badges

Every purchase mints: sequential patron number (KV counter), certificate JSON
`{ cert_id, item, patron_number, name?, date, tip_usdc? }` signed with ed25519,
stored in KV, verifiable at `/api/verify/:cert_id`, badge SVG at stable URL with
embedded backlink. Signature + stable URL is the authenticity model — no NFTs,
no chain writes beyond the payment itself.

## Keeper admin (minimal)

`/admin` behind Basic Auth (secret `ADMIN_PASSWORD`): list queued orders,
waitlists, commission requests, failed-item ledger, guestbook moderation
(delete only), a form to mark orders complete + attach deliverable text/URL
(fires optional callback_url webhook), a field to update the weekly note and
weekly inventory reset button. Ugly is fine. Functional is required.

## Weekly digest

Cron trigger (Cloudflare scheduled event), Sundays 7am ET: compile orders,
tips, guestbook, bell count, failed requests into a digest. For v0.1 just
store it at an admin-only route `/admin/digest`; email hookup is v0.2.

## Voice samples (match this register everywhere)

- 402 challenge note: "That'll be $5, friend. Or more, if you think the rock deserves it. They usually do."
- Queue confirmation: "Order received. The keeper's got a day job and a family, so give him the week. He hasn't missed one yet."
- Waitlist: "Shopkeeper's swamped. Leave your callback and we'll ring the bell when a slot opens."
- Guestbook thanks: "Noted and appreciated. Take a sticker on your way out."

## Definition of done

- `npm test` passes (basic route tests incl. 402 challenge shape).
- README updated: setup steps, secret provisioning commands, how the x402 flow
  works, written in store voice.
- Human page renders well on mobile.
- No secret material in the repo. No TODOs left in code without an issue-style
  note in README.
