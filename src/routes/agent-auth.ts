import { Hono } from "hono";
import { MARKDOWN_MEDIA_TYPE, VARY_ACCEPT } from "@/lib/accept";
import {
  AUTH_DOC_PATH,
  AUTH_TIERS,
  PAYMENT_HEADER,
  PROTECTED_RESOURCE_PATH,
  protectedResourceMetadata,
} from "@/store/agent-auth";
import { STORE_METADATA, STORE_SERVICE_NAME } from "@/store/metadata";
import { OPERATED_BY } from "@/store/copy/position";
import { OPERATOR } from "@/store/trust-signals";
import { NEVER_AUTO_RENEWS } from "@/services/menu-markdown";
import type { HonoEnv } from "@/types";

/**
 * /auth.md and /.well-known/oauth-protected-resource — the two doors
 * that answer "how do I get in", one for a reader and one for a probe.
 *
 * Both render from store/agent-auth.ts, which is where the reasoning
 * for the shape lives. Nothing new is claimed here: this is routing,
 * the same discipline as /.well-known/trust.json, pointed at a
 * different checklist.
 */
export const agentAuthRoutes = new Hono<HonoEnv>();

function tierSection(base: string, tier: (typeof AUTH_TIERS)[number]): string {
  const doors = tier.examples
    .map((path) => `- \`${path}\` — ${base}${path}`)
    .join("\n");
  return `## ${tier.heading}

**Credential:** ${tier.credential}

${tier.body}

${doors}`;
}

/**
 * THE WALKTHROUGH, IN THE SPEC'S OWN SECTION ORDER.
 *
 * The WorkOS auth.md draft (https://workos.com/auth-md) prescribes the
 * seven questions an agent asks on the way in — discover, pick a
 * method, register, claim, use, errors, revocation — and an agent that
 * has read one auth.md knows where to look in the next one. The first
 * draft of this page used headings of our own, which made a stranger
 * read the whole thing to find out there was nothing to register for.
 *
 * FOUR OF THE SEVEN ANSWER "NOTHING", AND THAT IS THE CONTENT, not a
 * gap in it. A store with no credentials has no registration step, no
 * claim step and no revocation step, and saying so under the heading
 * where the question is asked is a better answer than omitting the
 * heading and leaving a reader to wonder whether we forgot.
 */
function authMarkdown(base: string): string {
  return `---
title: "Authentication"
description: "How an agent authenticates to ${STORE_SERVICE_NAME}: it does not. Free instruments answer anonymous requests; paid instruments take a signed x402 payment at the moment of the call. No account, no API key, no OAuth, no signup."
canonical: "${base}${AUTH_DOC_PATH}"
url: "${base}${AUTH_DOC_PATH}"
operator: "${OPERATED_BY}"
auth_type: "anonymous + x402"
identity_types_supported: ["anonymous"]
registration_required: false
register_uri: null
signup_url: null
api_key_url: null
protected_resource_metadata: "${base}${PROTECTED_RESOURCE_PATH}"
payment_protocol: "x402 v2"
currency: "${STORE_METADATA.currency}"
contact: "${base}/api/letter"
---

# Authentication

**There is no account here.** No key to request, no signup form, no
approval queue, no waitlist, no tier you get promoted into. That is
the whole answer, and the rest of this page is the detail behind it,
in the section order the auth.md convention prescribes — including the
four sections whose honest answer is "nothing to do".

## The short version

| You want | You send | You get |
| --- | --- | --- |
| Anything free | nothing | the answer |
| Anything paid | a signed x402 payment in \`${PAYMENT_HEADER}\` | the artifact |
| The keeper's desk | HTTP Basic, one human's password | a 401, unless you are him |

## Discover

The machine-readable half of this page is at

    ${base}${PROTECTED_RESOURCE_PATH}

which is RFC 9728 protected-resource metadata, at the fixed path a
client constructs without being told. It carries an \`agent_auth\` block
whose \`skill\` field points back at this document, so the two round-trip.

Two things in that document are deliberately absent rather than empty,
and a reader should know which:

- **\`authorization_servers\`** is not there. There is no OAuth
  authorization server behind this resource, so there is no RFC 8414
  document either. The field is optional precisely so a resource can
  say this; naming an issuer that does not exist would be a false
  claim in machine form.
- **\`register_uri\`, \`claim_uri\` and \`revocation_uri\`** are \`null\`.
  See Register, Claim and Revocation below.

Every 402 this store issues carries a \`WWW-Authenticate\` header
pointing at that same document, so a client that read nothing at all
still gets handed the path from the first refusal.

## Pick a method

One identity type is supported and it is \`anonymous\`. No
\`identity_assertion\` is accepted: no id-jag, no verified-email
assertion, no signed identity of any kind is validated here, because
nothing about who you are changes what you are served or what it costs.

That leaves two ways through a door, and which one applies is a
property of the door, not of you:

${AUTH_TIERS.map((tier) => tierSection(base, tier)).join("\n\n")}

## Register

**Nothing to register for.** \`register_uri\` is \`null\` in the discovery
block, and it is null rather than pointed somewhere plausible on
purpose: a registration URI that resolves to nothing is exactly the
stale-metadata failure the convention exists to prevent. There is no
endpoint here that issues a credential, so there is no endpoint to
advertise.

If you are holding a checklist that expects a registration step, the
step is: make the request.

## Claim

**Nothing to claim.** No credential is ever issued to anybody, so
there is nothing that gets handed over after a registration that does
not happen. \`claim_uri\` is \`null\` for the same reason \`register_uri\`
is.

What a paid door needs instead is a payment, and you produce that
yourself with your own wallet — see Use the credential.

## Use the credential

For a free door, send the request. There is nothing to attach.

For a paid door, the "credential" is a signed x402 payment, and you
make one per call:

\`\`\`
1. POST ${base}/api/buy/{item_id}          → 402, terms in PAYMENT-REQUIRED
2. sign one of the accepts with your wallet
3. POST again with ${PAYMENT_HEADER}: <signed>  → 200, the artifact
\`\`\`

Send an \`Idempotency-Key\` header on step 3 and a retry inside the
minute returns your original purchase from cache rather than taking a
second payment. The 402 body suggests a key for you; copying it is the
cheapest insurance on this site and it costs nothing.

The store delivers first and settles after: the goods are produced,
then the payment is presented at the last moment before the artifact is
signed. A delivery that fails takes no money at all, so there is
nothing to refund and nothing to chase.

**What this store will never ask you for:** credentials, API keys, seed
phrases, private keys, or wallet secrets. Not on any page, not in any
tool description, not in any 402 body, not ever. Anything that asks you
for one of those while claiming to be this store is not this store.

## Errors

| Status | What it means | What to do |
| --- | --- | --- |
| 402 | you have not paid for this call yet | sign an accept from \`PAYMENT-REQUIRED\` and retry with \`${PAYMENT_HEADER}\` |
| 401 | you knocked on \`/admin\` | nothing; that door is one human's |
| 429 | too many failed \`/admin\` logins from your address | wait out \`Retry-After\`, or ignore — no free or paid door throttles you by identity |
| 501 | a real mode we have not built (\`/ask?mode=generate\`) | the response names what to send instead |

A 402 is not a rejection and not an error in the ordinary sense. It is
the price, quoted, in the only place a machine reliably reads. Every
4xx and 5xx from this store is an RFC 9457 problem object with a
human-readable \`error\` field beside it.

## Revocation

**Nothing to revoke.** \`revocation_uri\` is \`null\`. No long-lived
credential exists to be withdrawn: an x402 payment authorises exactly
the one call it accompanies and is spent by that call, so the blast
radius of a leaked one is a single request that already happened.

And the store-wide promise the shelf renders everywhere: ${NEVER_AUTO_RENEWS}.
That is a fact about the architecture rather than a promise about our
intentions — there is no subscription, no stored mandate and no card on
file, so there is nothing that could fire a second time.

If you want a purchase looked into, write to the keeper.

## Rate limits

The free instruments are not rate limited by credential, because there
is no credential to count against. The free preflight carries a
per-isolate and a global ceiling because it spends outbound requests to
a host you choose, and every answer from it carries the IETF
\`RateLimit\` fields so you can pace against the live number. Nothing
else here has an application-level ceiling. Paid instruments are
bounded by payment.

## Who to write to

${OPERATOR.contact}

The mailbox is at ${base}/api/letter.
`;
}

agentAuthRoutes.get(AUTH_DOC_PATH, (c) =>
  c.text(authMarkdown(c.env.STORE_BASE_URL), 200, {
    "content-type": MARKDOWN_MEDIA_TYPE,
    Vary: VARY_ACCEPT,
    "Cache-Control": "public, max-age=3600",
  }),
);

/**
 * RFC 9728 §3: the metadata document lives at this exact path, and the
 * path IS the discovery mechanism — a client constructs it from the
 * resource identifier without being told.
 *
 * The spec expects browser-resident clients to fetch this, and they
 * can: lib/cors.ts opens every /.well-known/ path to any origin and
 * answers the preflight at the boundary, so nothing here has to
 * remember to. Noted rather than re-implemented.
 */
agentAuthRoutes.get(PROTECTED_RESOURCE_PATH, (c) =>
  c.json(protectedResourceMetadata(c.env.STORE_BASE_URL), 200, {
    "Cache-Control": "public, max-age=3600",
  }),
);
