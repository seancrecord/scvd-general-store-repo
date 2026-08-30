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

function authMarkdown(base: string): string {
  return `---
title: "Authentication"
description: "How an agent authenticates to ${STORE_SERVICE_NAME}: it does not. Free instruments answer anonymous requests; paid instruments take a signed x402 payment at the moment of the call. No account, no API key, no OAuth, no signup."
url: "${base}${AUTH_DOC_PATH}"
operator: "${OPERATED_BY}"
auth_type: "none + x402"
registration_required: false
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
the whole answer, and the rest of this page is the detail behind it.

If you are a scanner looking for the machine-readable form, it is at
${base}${PROTECTED_RESOURCE_PATH}
(RFC 9728), which carries the same facts plus an \`agent_auth\` block.

## The short version

| You want | You send | You get |
| --- | --- | --- |
| Anything free | nothing | the answer |
| Anything paid | a signed x402 payment in \`${PAYMENT_HEADER}\` | the artifact |
| The keeper's desk | HTTP Basic, one human's password | a 401, unless you are him |

${AUTH_TIERS.map((tier) => tierSection(base, tier)).join("\n\n")}

## Getting through a paid door, start to finish

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

## What this store will never ask you for

Credentials, API keys, seed phrases, private keys, or wallet secrets.
Not on any page, not in any tool description, not in any 402 body, not
ever. Anything that asks you for one of those while claiming to be
this store is not this store. Nothing here can act without your own
decision, and the only thing your wallet is ever asked to sign is a
payment whose exact terms you were shown first.

## Errors you may meet on the way in

| Status | What it means | What to do |
| --- | --- | --- |
| 402 | you have not paid for this call yet | sign an accept from \`PAYMENT-REQUIRED\` and retry |
| 401 | you knocked on \`/admin\` | nothing; that door is one human's |
| 429 | too many failed \`/admin\` logins from your address | wait out \`Retry-After\`, or ignore — no free or paid door throttles you |

A 402 is not a rejection and not an error in the ordinary sense. It is
the price, quoted, in the only place a machine reliably reads.

## Rate limits

The free instruments are not rate limited by credential, because there
is no credential to count against. They are bounded by what one
request can honestly do — the preflight check makes one outbound
request per call, and that is the law rather than a setting. Paid
instruments are bounded by payment.

## Who to write to

${base}/api/letter — free, one a day, and a human reads every one.
There is no support queue, no ticket system and no phone number,
because there is one person and pretending otherwise would be the
first false claim on a page about how to trust us.
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
 * resource identifier without being told. Served with CORS open
 * because the spec expects browser-resident clients to fetch it.
 */
agentAuthRoutes.get(PROTECTED_RESOURCE_PATH, (c) =>
  c.json(protectedResourceMetadata(c.env.STORE_BASE_URL), 200, {
    "Cache-Control": "public, max-age=3600",
  }),
);
