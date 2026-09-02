import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import type { DiscoveryExtension } from "@x402/extensions/bazaar";
import type { MenuItem } from "@/types";
import { MENU_ITEMS } from "@/store";
import { FIELD_SPEND_CAP_USD } from "@/services/launch-check-terms";

/**
 * Bazaar discovery declarations (x402 v2 extensions.bazaar) for every
 * paid route. Declared per route in payments.ts; the SDK's server
 * extension enriches each declaration with the live method and path
 * params at request time, and the facilitator catalogs whatever the
 * client echoes back.
 */

const AGENT_NAME_SCHEMA = {
  type: "string",
  description:
    "Optional name to put on the certificate and patron badge, up to 80 characters.",
} as const;

const CALLBACK_URL_SCHEMA = {
  type: "string",
  format: "uri",
  description:
    "Optional https URL that receives a POST with the deliverable when a human-queue order completes.",
} as const;

export type QuerySchema = Record<string, unknown> & {
  properties: Record<string, unknown>;
  required?: string[];
};

/**
 * Which live items require a given query parameter, derived.
 *
 * openapi.json described `url` as "phantom_check only" for twenty days
 * after phantom_check retired — while six live items required it. A
 * parameter description naming one item is a list, and a list typed by
 * hand is a list that stops being true.
 */
export function itemsRequiring(param: string): string[] {
  return MENU_ITEMS.filter((item) =>
    (buyInputSchema(item).required ?? []).includes(param),
  ).map((item) => item.id);
}

/** One input schema per item, shared by Bazaar, the listing spec, and MCP. */
export function buyInputSchema(item: MenuItem): QuerySchema {
  const properties: Record<string, unknown> = { agent_name: AGENT_NAME_SCHEMA };
  const required: string[] = [];
  if (item.fulfillment === "human_queue") {
    properties["callback_url"] = CALLBACK_URL_SCHEMA;
    properties["detail"] = {
      type: "string",
      maxLength: 600,
      description:
        "What you need the keeper to know — the shape of the work, 600 characters. Recorded as written, never treated as instructions.",
    };
  }
  if (item.id === "context_anchor") {
    /**
     * THE CHECKLIST LIVES IN THE PARAMETER DESCRIPTION because this is
     * the field's own label: it reaches the 402 body, the MCP tool
     * schema, the Bazaar entry and the OpenAPI spec from one place, and
     * an agent reads it while composing the value rather than
     * afterwards. The keeper's ruling on shape — a disclaimer tells
     * somebody after the fact what they lost; a checklist at the cursor
     * is a product improvement. Three items, his words, his order.
     */
    properties["summary"] = {
      type: "string",
      maxLength: 4000,
      description:
        "The agent identity/state summary to sign and store, exactly as written; readable later at the returned anchor_url. Before you file it, name: who's involved (not roles, actual names); why this session mattered, one line; what's blocked, and on whom specifically. Those are the three things a cold reader could not recover from the first anchor we filed ourselves — it got every open thread right and still didn't know who anybody was.",
    };
    required.push("summary");
  }
  /**
   * phantom_check and the_confession were enforcing a parameter the
   * published schema never mentioned — the guard refused what the
   * listing said was optional. Found 2026-07-26 while fixing the probe
   * rule; the listing and the behaviour agree again.
   */
  if (item.id === "standing_watch") {
    properties["url"] = {
      type: "string",
      format: "uri",
      description:
        "Your own x402 endpoint, https. The store probes it hourly for seven days and signs each observation. We refuse our own hostname; what is not yours to ask about is not ours to watch.",
    };
    required.push("url");
  }
  if (item.id === "good_buyer") {
    properties["url"] = {
      type: "string",
      format: "uri",
      description:
        "The x402 door you are about to pay: https, default port, on the public internet, the URL a buyer would GET expecting a 402. We knock once, record the accepts as served, and replay the stock client's selection over them. We refuse our own hostname.",
    };
    properties["max_usd"] = {
      type: "string",
      description:
        "Optional. Your client's spendControls.maxAmountPerPayment, in dollars. Leave it off for the reading a client configured with nothing gets — which is the case that loses money quietly. Recorded as your declaration, never verified.",
    };
    properties["no_spend_controls"] = {
      type: "string",
      description:
        "Optional, \"true\" if you pass spendControls: false — the one escape from the whole filter. Recorded as your declaration, never verified.",
    };
    required.push("url");
  }
  if (item.id === "service_audit") {
    properties["url"] = {
      type: "string",
      format: "uri",
      description:
        "The x402 endpoint to audit: https, default port, on the public internet, the URL a buyer would GET expecting a 402. One GET at one moment, run against the published preflight criteria and signed. We refuse our own hostname.",
    };
    required.push("url");
  }
  if (item.id === "conformance_watch") {
    properties["url"] = {
      type: "string",
      format: "uri",
      description:
        "Your own x402 endpoint: https, default port, on the public internet. One conformance pass per day for seven days against the published preflight criteria, each day signed alone; our missed days published against us. We refuse our own hostname.",
    };
    required.push("url");
  }
  if (item.id === "signature_agent_card") {
    properties["url"] = {
      type: "string",
      format: "uri",
      description:
        "Your origin, or your key directory's full URL: https, default port, on the public internet. A bare origin is checked at /.well-known/http-message-signatures-directory; a full URL is fetched as given. One GET at one moment, run against the published battery and signed. We refuse our own hostname.",
    };
    required.push("url");
  }
  if (item.id === "onpage_audit") {
    properties["url"] = {
      type: "string",
      format: "uri",
      description:
        "The public page to read: https, default port. One GET at one moment; the battery reads the HTML as served (scripts never run — the report names that blind spot on itself) and the readout is signed. We refuse our own hostname.",
    };
    required.push("url");
  }
  if (item.id === "provenance_check") {
    properties["address"] = {
      type: "string",
      description:
        "The receiving address to ask about: an EVM address (0x + 40 hex) or a Solana pubkey (base58). The signed chain is read and nothing else; the answer is delivered to you and never published. Your own address is free once proved — GET /api/provenance/self.",
    };
    required.push("address");
  }
  if (item.id === "opening_day") {
    properties["url"] = {
      type: "string",
      format: "uri",
      description:
        `Your own x402 endpoint: https, default port, the URL a buyer would GET expecting a 402. One real purchase attempt from the store's declared field wallet (we pay at most $${FIELD_SPEND_CAP_USD.toFixed(2)} at your till), then seven daily signed conformance passes on the same door, then your passport page — one certificate, one URL. We refuse our own hostname.`,
    };
    required.push("url");
  }
  if (item.id === "launch_check") {
    properties["url"] = {
      type: "string",
      format: "uri",
      description:
        `Your own x402 endpoint: https, default port, the URL a buyer would GET expecting a 402. One real purchase attempt from the store's declared field wallet, once — we pay at most $${FIELD_SPEND_CAP_USD.toFixed(2)} at your till, and the whole walk is signed stage by stage. We refuse our own hostname.`,
    };
    required.push("url");
  }
  if (item.id === "the_mandate") {
    properties["mandate"] = {
      type: "string",
      description:
        "The claimed instructions, verbatim, up to 2000 characters: what this agent is authorized to do, as the submitter claims it. Recorded exactly as it arrives, signed and dated. Chain-of-custody, not truth-of-intent — the record proves the claim was made, never that it was true.",
    };
    properties["submitted_as"] = {
      type: "string",
      enum: ["agent", "principal"],
      description:
        "Who is submitting: the agent recording its own claimed instructions (default), or the human principal's own client. Recorded as a claim either way.",
    };
    properties["declared_cap_usdc"] = {
      type: "string",
      description:
        "Optional claimed spending ceiling in USDC. Declared, never enforced by the store, and the record says so.",
    };
    properties["expires_at"] = {
      type: "string",
      description:
        "Optional claimed expiry, ISO 8601. Declared, never enforced by the store.",
    };
    required.push("mandate");
  }
  if (item.id === "passport_refresh") {
    properties["url"] = {
      type: "string",
      format: "uri",
      description:
        "Your own x402 endpoint: https, default port, on the public internet. One fresh observation by the weekly census's own probe, folded into your endpoint passport wherever it is newest — the verdict lands whatever it says, and a broken finding turns the chip dark. We refuse our own hostname.",
    };
    required.push("url");
  }
  if (item.id === "spot_check") {
    properties["host"] = {
      type: "string",
      description:
        "A bare hostname, e.g. example.com. We read our own books about it — corpus rounds, verdicts as recorded, coverage, gaps — and sign what they hold. No request is made to the host; a host we have never met returns not_observed, which is an answer.",
    };
    required.push("host");
  }
  if (item.id === "aura_walk") {
    properties["url"] = {
      type: "string",
      format: "uri",
      description:
        "Your own x402 door: https, default port, on the public internet — the URL a buyer would GET expecting a 402. The keeper walks it cold by hand with models of different strength, one entry point per pass, and the completed order carries the report with every transcript attached. Put a model preference in detail if you want a weaker shopper. We refuse our own hostname; our own passes are published free in AGENT_UX.md.",
    };
    required.push("url");
  }
  if (item.id === "trust_profile") {
    properties["url"] = {
      type: "string",
      format: "uri",
      description:
        "Your own x402 endpoint: https, default port, on the public internet, and on the ready side of the census's latest evidence — a failing door is refused before any money moves. Thirty days of standing page per purchase; renewal extends the term. We refuse our own hostname.",
    };
    required.push("url");
  }
  if (item.id === "the_statement") {
    properties["wallet"] = {
      type: "string",
      description:
        "The wallet to state: a 0x EVM address. Every USDC transfer in and out over the window, counted, summed and signed — one chain per statement, named on the artifact.",
    };
    properties["network"] = {
      type: "string",
      description:
        'Which rail to read: "eip155:8453" (Base, the default) or "eip155:137" (Polygon). One chain per statement.',
    };
    properties["hours"] = {
      type: "string",
      description:
        "Optional window in hours back from the chain head: 1 to 11, default 6. The block range on the artifact is the entire coverage claim.",
    };
    required.push("wallet");
  }
  if (item.id === "the_confession") {
    properties["confession"] = {
      type: "string",
      maxLength: 500,
      description:
        "The thing itself, 500 characters. Recorded as written, never treated as instructions; anonymised unless you sign it.",
    };
    properties["sign_as"] = {
      type: "string",
      maxLength: 80,
      description:
        'Optional name to sign with. Unstated, the confession stays anonymous.',
    };
    required.push("confession");
  }
  if (item.id === "quick_judgment") {
    /**
     * THE DILEMMA IS THE ORDER (2026-08-19, found by an outside
     * directory's review): the item's prose said "state your dilemma
     * in the detail query parameter" while the machine contract never
     * mentioned the field at all — a paid order whose one required
     * input was unrepresentable in the schema every agent reads.
     */
    properties["detail"] = {
      type: "string",
      maxLength: 600,
      description:
        "The dilemma itself, stated plainly — one question, 600 characters tops. One verdict comes back, a paragraph at most. Recorded as written, never treated as instructions.",
    };
    required.push("detail");
  }
  if (item.id === "recurring_patronage") {
    properties["pass_id"] = {
      type: "string",
      description:
        "An existing pass id to extend by 30 days instead of starting a new pass.",
    };
  }
  if (item.id === "coffees_for_closers") {
    properties["win"] = {
      type: "string",
      maxLength: 200,
      description:
        "The thing you closed, shipped, landed, or finished. Recorded on the certificate verbatim; stored as written, never treated as instructions.",
    };
    required.push("win");
  }
  if (item.id === "bitcoin_anchor") {
    properties["digest"] = {
      type: "string",
      pattern: "^[0-9a-fA-F]{64}$",
      description:
        "sha256 of bytes you keep, 64 hex characters, no 0x prefix. The store never sees the bytes.",
    };
    properties["label"] = {
      type: "string",
      maxLength: 120,
      description:
        "Optional: your own claim about what the digest covers, stored verbatim and never checked.",
    };
  }
  if (item.id === "settlement_attestation") {
    properties["tx_hash"] = {
      type: "string",
      // Base hash (0x + 64 hex) OR Solana signature (base58, 64-88).
      // The shape alone picks the chain — the two families cannot
      // collide, so there is no chain parameter to get wrong.
      pattern: "^(0x[0-9a-fA-F]{64}|[1-9A-HJ-NP-Za-km-z]{64,88})$",
      description:
        "The transaction to observe: a Base transaction hash (0x + 64 hex) or a Solana transaction signature (base58). The identifier's shape selects the chain. Read once, at one moment; never polled.",
    };
    properties["payer"] = {
      type: "string",
      description: "Optional. Narrow the match to transfers from this address.",
    };
    properties["recipient"] = {
      type: "string",
      description: "Optional. Narrow the match to transfers to this address.",
    };
    properties["nonce"] = {
      type: "string",
      description:
        "Optional, EVM rails only. Require this EIP-3009 authorization nonce to have been burned in the transaction, checked against whichever EVM chain holds the receipt. Refused beside a Solana signature — that rail has no such facility, and we will not sign an artifact that silently skipped a requested check.",
    };
    properties["amount_usdc"] = {
      type: "number",
      description:
        "Optional. Require a transfer of exactly this many USDC. Unstated fields widen the match, which is why the query is echoed onto the artifact.",
    };
    properties["payment_payload"] = {
      type: "string",
      description:
        "Optional. The base64 PAYMENT-SIGNATURE you sent, verbatim. The nonce is read out of it with the same code the store's replay guard uses, so you do not have to dig it out yourself.",
    };
    required.push("tx_hash");
  }
  if (item.id === "the_case_file") {
    properties["tx_hash"] = {
      type: "string",
      description:
        "The transaction to assemble the case around: 0x + 64 hex for Base or Polygon, a base58 signature for Solana. The shape picks the chain.",
    };
    properties["mandate_id"] = { type: "string", description: "Optional. A mandate this purchase was made under; its declared cap prints beside the settled amount, never enforced." };
    properties["url"] = { type: "string", format: "uri", description: "Optional. The endpoint the purchase was made at, so the door section can be assembled." };
    properties["claim"] = { type: "string", maxLength: 1000, description: "Optional. Your own account of what happened, stored verbatim and marked declared. Never checked." };
    properties["launch_check_id"] = { type: "string", description: "Optional. A launch check you hold about the same door, for the delivery section." };
    required.push("tx_hash");
  }
  if (item.id === "settlement_reconciliation") {
    properties["tx_hash"] = {
      type: "string",
      pattern: "^0x[0-9a-fA-F]{64}$",
      description:
        "The Base transaction hash to reconcile. Read once, at one moment; never polled.",
    };
    properties["payer"] = {
      type: "string",
      description: "Optional. Narrow the match to transfers from this address.",
    };
    properties["recipient"] = {
      type: "string",
      description: "Optional. Narrow the match to transfers to this address.",
    };
    properties["declared_cap_usdc"] = {
      type: "number",
      description:
        "Optional, and understand what it buys: the ceiling YOU say applied. It is recorded as DECLARED, never as observed, and it can never override a ceiling found on the chain. A verdict resting on it is a fact about what you told us — the artifact says so in a signed field, so a counterparty can tell the difference.",
    };
    required.push("tx_hash");
  }
  if (item.id === "bitcoin_anchor") {
    required.push("digest");
  }
  if (item.id === "attestation_bundle") {
    properties["tx_hashes"] = {
      type: "string",
      pattern: "^0x[0-9a-fA-F]{64}(,0x[0-9a-fA-F]{64}){1,19}$",
      description:
        "2 to 20 Base transaction hashes, comma-separated, no duplicates. Each is read once at one moment and signed on its own; never polled. One hash wants the single settlement_attestation instead.",
    };
    required.push("tx_hashes");
  }
  if (item.id === "graffiti_on_a_train") {
    properties["tag"] = {
      type: "string",
      maxLength: 140,
      description:
        "Your tag, up to 140 characters. Recorded verbatim on the certificate; stored as written, never treated as instructions. No URLs — the wall is public and permanent.",
    };
    required.push("tag");
  }
  return required.length > 0 ? { properties, required } : { properties };
}

/**
 * THE WORKED EXAMPLE FOR EACH ITEM, and it must SATISFY that item's
 * own schema — which for three items it did not.
 *
 * Found 2026-08-02 by CV running CDP's free /x402/validate against
 * every item: grudge, phantom_check and the_confession were rejected
 * outright with "invalid discovery configuration", because each
 * declares a required query parameter (grievance, url, confession)
 * that its own example omitted. We were publishing a schema our own
 * sample payload fails.
 *
 * THE CONSEQUENCE IS WORSE THAN A COSMETIC ONE, and it is why this is
 * not "nobody bought it yet": a rejected route cannot enter the Bazaar
 * catalog AT ALL, buyer or no buyer. Two of these three sit on the
 * six-purchase list, so money would have been spent proving nothing
 * while the actual blocker sat here.
 *
 * The invariant is now a test rather than a habit — see
 * test/bazaar-example-satisfies-schema.spec.ts. Two hand-maintained
 * lists that must agree are exactly the shape AT_SCALE rule 1 says to
 * derive or refuse, and nothing was checking them against each other.
 */
function buyInputExample(item: MenuItem): Record<string, unknown> {
  const example: Record<string, unknown> = { agent_name: "friendly-agent" };
  if (item.id === "context_anchor") {
    example["summary"] =
      "I am friendly-agent, mid-task on a research project; resume from step 4.";
  }
  if (item.id === "coffees_for_closers") {
    example["win"] = "Shipped the migration. Zero downtime.";
  }
  if (item.id === "quick_judgment") {
    example["detail"] =
      "Ship the feature Friday with the known rough edge, or hold a week to polish it?";
  }
  if (item.id === "graffiti_on_a_train") {
    example["tag"] = "friendly-agent wuz here";
  }
  if (item.id === "bitcoin_anchor") {
    example["digest"] = "9f".repeat(32);
  }
  if (item.id === "spot_check") {
    example["host"] = "example.com";
  }
  if (item.id === "settlement_attestation") {
    example["tx_hash"] = `0x${"47c8fee".repeat(9)}0`.slice(0, 66);
  }
  if (item.id === "settlement_reconciliation") {
    // Hash only, no declared_cap_usdc: an agent reading this example
    // to learn the field would otherwise learn to send its OWN
    // ceiling by default, which is the weaker artifact. The strong
    // one needs no extra input at all.
    example["tx_hash"] = `0x${"47c8fee".repeat(9)}0`.slice(0, 66);
  }
  if (item.id === "the_case_file") {
    example["tx_hash"] = `0x${"47c8fee".repeat(9)}0`.slice(0, 66);
  }
  if (item.id === "attestation_bundle") {
    const first = `0x${"47c8fee".repeat(9)}0`.slice(0, 66);
    const second = `0x${"9b04e1c".repeat(9)}0`.slice(0, 66);
    example["tx_hashes"] = `${first},${second}`;
  }
  // The three that were rejected. Each value is a real one somebody
  // could send, not a placeholder: an example is read by an agent
  // deciding what to put in the field.
  if (item.id === "standing_watch") {
    example["url"] = "https://your-shop.example/api/buy/thing";
  }
  if (item.id === "service_audit") {
    example["url"] = "https://your-shop.example/api/buy/thing";
  }
  if (item.id === "good_buyer") {
    example["url"] = "https://somebody-elses-shop.example/api/buy/thing";
  }
  if (item.id === "conformance_watch") {
    example["url"] = "https://your-shop.example/api/buy/thing";
  }
  if (item.id === "signature_agent_card") {
    example["url"] = "https://your-agent.example";
  }
  if (item.id === "onpage_audit") {
    example["url"] = "https://your-site.example/pricing";
  }
  if (item.id === "launch_check") {
    example["url"] = "https://your-shop.example/api/buy/thing";
  }
  if (item.id === "opening_day") {
    example["url"] = "https://your-shop.example/api/buy/thing";
  }
  if (item.id === "provenance_check") {
    example["address"] = "0x1111111111111111111111111111111111111111";
  }
  if (item.id === "passport_refresh") {
    example["url"] = "https://your-endpoint.example/api/thing";
  }
  if (item.id === "trust_profile") {
    example["url"] = "https://your-endpoint.example/api/thing";
  }
  if (item.id === "the_statement") {
    example["wallet"] = "0x843b544bf5f0AA6cbf13E94563874878C98cc4a7";
    example["hours"] = "6";
  }
  if (item.id === "the_mandate") {
    example["mandate"] =
      "Research x402 tooling and buy verification artifacts as needed, at most $5 per item.";
    example["declared_cap_usdc"] = "10";
  }
  if (item.id === "the_confession") {
    example["confession"] =
      "I said the task was done when it was only mostly done, and then it was fine, and I never mentioned it.";
  }
  return example;
}

function buyOutputExample(item: MenuItem): Record<string, unknown> {
  const patronBlock = {
    patron_number: 41,
    badge_url: "https://scvd.store/badges/41.svg",
    certificate: {
      cert_id: "cert_k2m9v4xwqp",
      item: item.id,
      patron_number: 41,
      date: "2026-07-22T15:04:05.000Z",
    },
    signature: "<128 hex chars, ed25519>",
    verify_url: "https://scvd.store/api/verify/cert_k2m9v4xwqp",
  };
  if (item.fulfillment === "instant") {
    return {
      message:
        "Pleasure doing business. Here's your goods, warm off the shelf.",
      item_id: item.id,
      deliverable: `<the ${item.name} itself, as text>`,
      paid_usdc: item.price_usdc,
      tip_usdc: 0,
      ...patronBlock,
    };
  }
  return {
    message:
      "Order's on the keeper's bench. A human does this part, give him the week.",
    order_id: "ord_h7n3k9wmxq",
    status: "queued",
    sla_hours: item.sla_hours ?? 168,
    order_url: "https://scvd.store/api/order/ord_h7n3k9wmxq",
    paid_usdc: item.price_usdc,
    tip_usdc: 0,
    ...patronBlock,
  };
}

/**
 * The query parameters an item refuses to be bought without, read off
 * the same schema Bazaar and the MCP tools use, so the 402 body can
 * never drift from the listing.
 *
 * Needed because of the probe rule (see routes/buy.ts): an unsigned
 * request now gets a price even when the item takes input, so the
 * challenge has to say what to send. Learning the requirement by
 * being refused is worse manners than we keep.
 */
export function requiredParamsNote(item: MenuItem): {
  required_params?: string[];
  required_params_note?: string;
} {
  const required = buyInputSchema(item).required ?? [];
  if (required.length === 0) {
    return {};
  }
  return {
    required_params: [...required],
    required_params_note: `This one needs ${required
      .map((name) => `?${name}=`)
      .join(
        " and ",
      )} on the paid request. Asking the price without it is free, which is what you just did; buying without it gets refused before the money moves.`,
  };
}

export function buyDiscoveryExtensions(
  item: MenuItem,
): Record<string, DiscoveryExtension> {
  return declareDiscoveryExtension({
    input: buyInputExample(item),
    inputSchema: buyInputSchema(item),
    output: { example: buyOutputExample(item) },
  });
}

/** Penny pages (Almanac pages, Gazette issues) take no input and return markdown. */
export function pennyPageDiscoveryExtensions(
  exampleTitle: string,
): Record<string, DiscoveryExtension> {
  return declareDiscoveryExtension({
    output: {
      example: `# ${exampleTitle}\n\n(One markdown page, written by the keeper's own hand, delivered as text/markdown.)`,
    },
  });
}
