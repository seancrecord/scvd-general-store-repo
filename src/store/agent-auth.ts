import { STORE_METADATA, STORE_SERVICE_NAME } from "@/store/metadata";

/**
 * HOW AN AGENT GETS IN, IN ONE PLACE, BECAUSE THE ANSWER IS UNUSUAL
 * AND AN UNUSUAL ANSWER IS THE ONE MOST OFTEN GUESSED AT.
 *
 * A discoverability scan run against this store on 2026-08-30 scored
 * nought on every row of its "agent auth" family — no auth document,
 * no RFC 9728 metadata, no `WWW-Authenticate` hint — and the reading
 * was fair. What was NOT fair was the conclusion a reader draws from
 * it, which is that the door is shut. The opposite is true: there is
 * no account here, no key to request, no signup form and no approval
 * queue. Every free instrument answers a cold, anonymous request, and
 * every paid one is bought by paying for it, once, at the moment of
 * the call.
 *
 * That is a HARDER thing to publish than an API key, not an easier
 * one, because the conventions were all written for stores that hand
 * out credentials. So this file says the unusual thing plainly and
 * every surface renders from it: /auth.md for a reader,
 * /.well-known/oauth-protected-resource for the RFC 9728 probe, the
 * `agent_auth` block for a scanner, and the `WWW-Authenticate` hint
 * on the 402 itself for the client that never read any of them.
 *
 * THE RULE THIS FILE IS UNDER. The store never claims a protocol it
 * does not speak (the position published at /developers). So the
 * RFC 9728 document names NO authorization server, because there is
 * none — the spec makes that field optional precisely so a resource
 * can describe itself honestly, and inventing an issuer URL to score
 * a checklist point would be the exact defect this store sells the
 * detection of.
 */

/** The scheme token on the `WWW-Authenticate` hint. See AGENT_AUTH.challenge. */
export const X402_AUTH_SCHEME = "X402";

/** RFC 9728's fixed path. The probe knows it; nothing has to link it. */
export const PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource";

/** The reader's door. Named by robots.txt, llms.txt and the 402 hint. */
export const AUTH_DOC_PATH = "/auth.md";

/**
 * The header an agent sends its signed payment in, and the older name
 * still honoured. Quoted rather than restated: lib/payments.ts is
 * where the request is actually read, and two hand-typed copies of a
 * header name is how one of them goes stale arguing with the other.
 */
export const PAYMENT_HEADER = "PAYMENT-SIGNATURE";
export const PAYMENT_HEADER_LEGACY = "X-PAYMENT";

/** One tier of access, named by what it costs to get through it. */
export interface AuthTier {
  id: string;
  heading: string;
  /** What a caller must present. "Nothing" is a legitimate answer. */
  credential: string;
  body: string;
  /** Live doors in this tier. Every one must answer; a test walks them. */
  examples: readonly string[];
}

export const AUTH_TIERS: readonly AuthTier[] = [
  {
    id: "anonymous",
    heading: "The free instruments: no credential of any kind",
    credential: "none",
    body:
      "Send the request. There is no key, no token, no account, no signup, no waitlist and no rate-limit tier you get promoted into. The preflight check, the conformance desk, the defect vocabulary, the corpus, every room in the store and the MCP `tools/list` are all answered cold, to anyone, including a client that has never been here before. If a request to one of these fails, it failed for a reason printed in the body — never because you were not recognised.",
    examples: [
      "/api/preflight",
      "/api/conformance",
      "/corpus.json",
      "/menu.json",
      "/openapi.json",
    ],
  },
  {
    id: "x402",
    heading: "The paid instruments: pay for the call, at the call",
    credential: `a signed x402 v2 payment in the ${PAYMENT_HEADER} header`,
    body:
      `Call the door once with no payment. It answers 402 with the terms in the PAYMENT-REQUIRED response header (base64 JSON) and in the body. Sign one of the offered accepts with your own wallet, and call again with the payment in ${PAYMENT_HEADER} (over MCP: \`_meta['x402/payment']\`). The older ${PAYMENT_HEADER_LEGACY} name is honoured too. That signature IS the credential: it authenticates nothing about who you are, and it does not have to — it settles the call it paid for and it is good for that call only. Nothing is stored against your identity because there is no identity to store it against.`,
    examples: ["/api/buy/{item_id}", "/menu.json", "/pricing"],
  },
  {
    id: "keeper",
    heading: "The back office: HTTP Basic, and it is not for you",
    credential: "HTTP Basic, one human's password",
    body:
      "/admin is the keeper's own desk and takes HTTP Basic credentials that exist for exactly one person. It is listed here for completeness and because a scanner will find the 401 and ask: no agent has business behind it, no credential for it is issued to anyone, and a failed attempt is throttled per address and raises an alarm. It is named, rather than hidden, because a door you can see the shape of is a door nobody has to guess at.",
    examples: ["/admin"],
  },
] as const;

/**
 * WHAT THE 402 SAYS IN A HEADER, for the client that arrived without
 * reading anything. RFC 9110 §11.6.1 permits `WWW-Authenticate` on
 * responses other than 401 "to indicate that supplying credentials
 * might affect the response", which is precisely the case here, and
 * RFC 9728 §5.1 defines the `resource_metadata` parameter that points
 * a client at the document below.
 *
 * DELIBERATELY SHORT, and the reason is a byte budget, not taste. The
 * 402 challenge on the widest item already carries nine signed offers
 * against Node's 16KB header cliff (test/challenge-header-budget), so
 * every header added to that response is spent from a real allowance.
 * One parameter, the one a probe reads.
 */
export function challengeHint(base: string): string {
  return `${X402_AUTH_SCHEME} resource_metadata="${base}${PROTECTED_RESOURCE_PATH}"`;
}

/**
 * The `agent_auth` block: the same three tiers, shaped for a scanner
 * rather than a reader. Embedded in the RFC 9728 document and in
 * /.well-known/trust.json, so a diligence pass that found either one
 * has the whole answer without a second fetch.
 *
 * EVERY URL HERE IS LIVE. That is the point of the field and the one
 * way it can lie, so test/agent-auth.spec.ts fetches each and fails
 * on anything that does not answer.
 */
export function agentAuthBlock(base: string) {
  return {
    /**
     * The headline, first, because a scanner that reads one field
     * reads this one and the honest summary is better for us than
     * whatever it would infer from silence.
     */
    summary:
      "No account, no API key, no OAuth, no signup. Free instruments answer anonymous requests; paid instruments are paid for at the moment of the call with a signed x402 payment. There is nothing to apply for and nobody to ask.",
    registration_required: false,
    signup_url: null,
    /**
     * Null rather than absent, and null rather than an invented URL:
     * a scanner distinguishes "declared none" from "forgot to say",
     * and this store would rather be read as the first.
     */
    api_key_url: null,
    oauth_authorization_server: null,
    documentation_url: `${base}${AUTH_DOC_PATH}`,
    protected_resource_metadata: `${base}${PROTECTED_RESOURCE_PATH}`,
    payment_protocol: {
      name: "x402",
      version: 2,
      request_header: PAYMENT_HEADER,
      legacy_request_header: PAYMENT_HEADER_LEGACY,
      challenge_header: "PAYMENT-REQUIRED",
      mcp_meta_key: "x402/payment",
      settles_in: STORE_METADATA.currency,
      networks: ["base", "polygon", "solana"],
      idempotency_header: "Idempotency-Key",
      terms: `${base}/pricing`,
    },
    tiers: AUTH_TIERS.map((tier) => ({
      id: tier.id,
      credential: tier.credential,
      summary: tier.heading,
      /**
       * Absolute, so a reader following this block never resolves a
       * relative path against a base it had to guess. One of them is a
       * TEMPLATE rather than an address (/api/buy/{item_id}); it stays
       * in the list because the shape is the useful part, and
       * test/agent-auth.spec.ts skips the braces rather than knocking
       * on them.
       */
      example_urls: tier.examples.map((path) => `${base}${path}`),
    })),
    contact: `${base}/api/letter`,
  };
}

/**
 * RFC 9728 protected-resource metadata.
 *
 * `authorization_servers` IS ABSENT, not empty and not invented. The
 * spec makes it optional; this resource has no OAuth issuer behind
 * it, and the whole value of publishing the document is that a client
 * learns that in one fetch instead of probing for an issuer that was
 * never there. The `x402` extension carries what actually gates the
 * paid doors, under a name no future revision of the spec will claim.
 */
export function protectedResourceMetadata(base: string) {
  return {
    resource: base,
    resource_name: STORE_SERVICE_NAME,
    resource_documentation: `${base}${AUTH_DOC_PATH}`,
    resource_policy_uri: `${base}/pricing`,
    resource_tos_uri: `${base}/rights`,
    /**
     * The store issues no bearer tokens, so it supports no method of
     * presenting one. Declared as an empty list because that is the
     * true answer to the question the field asks, and a reader that
     * gets an empty list stops looking.
     */
    bearer_methods_supported: [],
    scopes_supported: [],
    "x402": {
      supported: true,
      version: 2,
      request_header: PAYMENT_HEADER,
      challenge_header: "PAYMENT-REQUIRED",
      discovery: `${base}/.well-known/x402.json`,
    },
    agent_auth: agentAuthBlock(base),
  };
}
