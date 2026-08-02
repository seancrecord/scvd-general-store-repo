import { Hono } from "hono";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { SPEC_SCHEMA_PATH } from "@/lib/listing-spec";
import {
  IDEMPOTENCY_TTL_SECONDS,
  SUGGESTED_KEY_BUCKET_SECONDS,
} from "@/lib/idempotency";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { MENU_ITEMS, STORE_METADATA } from "@/store";
import {
  CHEAP_DOOR_ITEM_IDS,
  PRACTICE_COUNTER_COPY as COPY,
} from "@/store/copy/practice-counter";
import {
  ANCHOR_CHECKLIST,
  WHAT_SURVIVES,
} from "@/store/copy/anchor-writing";
import { HAND_ROLLING } from "@/store/hand-rolling";
import { SAMPLE_ARTIFACT_ID } from "@/store/spec";
import type { HonoEnv } from "@/types";

/**
 * GET /try, the Practice Counter: the store as a live x402 target for
 * anyone building a client. No new items, no discount, no sandbox,
 * one page saying out loud what the store already does. Words live in
 * src/store/copy/practice-counter.ts (keeper-editable); this file
 * hangs them up and fills the prices from the live menu.
 *
 * JSON for agents, a paper page for humans, same facts either way.
 */
export const practiceCounterRoutes = new Hono<HonoEnv>();

interface CheapDoorRow {
  id: string;
  name: string;
  price_usdc: number;
  fulfillment: string;
}

/** The under-a-dollar shelf, cheapest first, priced from the live menu. */
function cheapDoor(): CheapDoorRow[] {
  return CHEAP_DOOR_ITEM_IDS.map((id) =>
    MENU_ITEMS.find((item) => item.id === id),
  )
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .map((item) => ({
      id: item.id,
      name: item.name,
      price_usdc: item.price_usdc,
      fulfillment: item.fulfillment === "instant" ? "instant" : "human queue",
    }))
    .sort((a, b) => a.price_usdc - b.price_usdc);
}

/**
 * The cheapest real settlement A PRACTICE CLIENT CAN MAKE WITH NO
 * ARGUMENTS. Not simply the cheapest item — that distinction matters
 * and I got it wrong first: adding settlement_attestation ($0.004) to
 * this page's door made it the cheapest thing here, and it REQUIRES a
 * tx_hash. Naming it as the recommended first buy would have handed a
 * builder who wants to exercise the payment path a homework problem
 * first. The recommended door takes no parameters; the cheaper item is
 * still listed, just not as the way in.
 */
function cheapest(): CheapDoorRow | undefined {
  return cheapDoor().find((row) => {
    const item = MENU_ITEMS.find((entry) => entry.id === row.id);
    return item ? (buyInputSchema(item).required ?? []).length === 0 : false;
  });
}

function steps(base: string, cheapestId: string): string[] {
  return [
    `GET ${base}/api/buy/${cheapestId}?src=try`,
    `We answer 402 Payment Required. The machine-readable terms ride the PAYMENT-REQUIRED response header (base64 JSON): scheme "exact", network eip155:8453, the USDC asset, the amount, our address. The body carries the item's spec, the verification block, and our full signing key.`,
    `Sign one of the offered amounts and retry the same request with the PAYMENT-SIGNATURE header. We verify, settle, and only then hand over the goods, a signed certificate with an id you can check at ${base}/api/verify/{cert_id}.`,
  ];
}

practiceCounterRoutes.get("/try", (c) => {
  const base = c.env.STORE_BASE_URL;
  const shelf = cheapDoor();
  const low = cheapest();
  const flow = steps(base, low?.id ?? "hello");

  if (wantsHtml(c.req.header("Accept"))) {
    const list = (lines: readonly string[]): string =>
      lines.map((line) => `<p class="menu-desc">${escapeHtml(line)}</p>`).join("\n");

    const flowHtml = flow
      .map(
        (step, index) => `<div class="menu-item">
        <div class="menu-line"><span class="menu-name">${index + 1}</span></div>
        <p class="menu-desc">${escapeHtml(step)}</p>
      </div>`,
      )
      .join("\n");

    // The exact domain, laid out to be copied rather than retyped.
    const eip712Html = Object.entries(HAND_ROLLING.eip712)
      .map(
        ([field, value]) => `<div class="menu-item">
        <div class="menu-line">
          <span class="menu-name"><code>${escapeHtml(field)}</code></span>
          <span class="menu-dots"></span>
          <span class="menu-price"><code>${escapeHtml(String(value))}</code></span>
        </div>
      </div>`,
      )
      .join("\n");

    const shelfHtml = shelf
      .map(
        (row) => `<div class="menu-item">
        <div class="menu-line">
          <span class="menu-name">${escapeHtml(row.name)}</span>
          <span class="menu-dots"></span>
          <span class="menu-price">$${row.price_usdc}</span>
        </div>
        <p class="menu-meta"><code>GET /api/buy/${escapeHtml(row.id)}</code> • ${escapeHtml(row.fulfillment)}</p>
      </div>`,
      )
      .join("\n");

    return c.html(
      renderSimplePage({
        title: COPY.title,
        description:
          "Practice your x402 client against a real till. No sandbox and no test mode: the cheapest item is half a cent, every purchase signs its own receipt, and the worked EIP-712 example shows the domain trap that fails silently.",
        path: "/try",
        bodyHtml: `<section>
          <p class="menu-desc">${escapeHtml(COPY.standfirst)}</p>
        </section>
        <section>
          <h2>${escapeHtml(COPY.whyHead)}</h2>
          ${list(COPY.why)}
        </section>
        <section>
          <h2>${escapeHtml(COPY.stepsHead)}</h2>
          ${flowHtml}
          <p class="menu-desc">${escapeHtml(COPY.stepsNote)}</p>
        </section>
        <section>
          <h2>${escapeHtml(COPY.retryHead)}</h2>
          ${list(COPY.retry)}
        </section>
        <section id="hand-rolling">
          <h2>${escapeHtml(HAND_ROLLING.heading)}</h2>
          <p class="menu-desc">${escapeHtml(HAND_ROLLING.standfirst)}</p>
          <p class="menu-desc"><strong>${escapeHtml(HAND_ROLLING.domain_warning)}</strong></p>
          ${eip712Html}
          <p class="menu-desc">${escapeHtml(HAND_ROLLING.envelope)}</p>
          <p class="menu-desc"><strong>${escapeHtml(HAND_ROLLING.echo_the_offer)}</strong></p>
          <h3>${escapeHtml(HAND_ROLLING.worked_example.heading)}</h3>
          <div class="menu-item">
            <p class="menu-meta">RIGHT</p>
            <pre class="menu-desc"><code>${escapeHtml(JSON.stringify(HAND_ROLLING.worked_example.right, null, 2))}</code></pre>
          </div>
          <div class="menu-item">
            <p class="menu-meta">WRONG — and the signature is fine in both</p>
            <pre class="menu-desc"><code>${escapeHtml(JSON.stringify(HAND_ROLLING.worked_example.wrong, null, 2))}</code></pre>
          </div>
          <p class="menu-desc">${escapeHtml(HAND_ROLLING.worked_example.the_difference)}</p>
          <p class="menu-desc">${escapeHtml(HAND_ROLLING.amounts)}</p>
          <p class="menu-desc">${escapeHtml(HAND_ROLLING.validity)}</p>
          <p class="menu-desc">${escapeHtml(HAND_ROLLING.read_the_challenge)}</p>
          <p class="menu-desc">${escapeHtml(HAND_ROLLING.practice)}</p>
          <p class="menu-meta">${escapeHtml(HAND_ROLLING.honest_limit)}</p>
        </section>
        <section>
          <h2>${escapeHtml(COPY.cheapHead)}</h2>
          ${shelfHtml}
          <p class="menu-desc">${escapeHtml(COPY.cheapNote)}</p>
        </section>
        <section>
          <h2>${escapeHtml(COPY.stuckHead)}</h2>
          ${list(COPY.stuck)}
          <p class="menu-meta"><code>GET /api/buy/settlement_attestation?tx_hash=0x…</code></p>
        </section>
        <section>
          <h2>${escapeHtml(COPY.anchorHead)}</h2>
          ${list(COPY.anchor)}
          <p class="menu-desc">${escapeHtml(WHAT_SURVIVES)}</p>
          <p class="menu-meta"><code>GET /api/buy/context_anchor?summary=…</code></p>
        </section>
        <section>
          <h2>${escapeHtml(COPY.verifyHead)}</h2>
          ${list(COPY.verify)}
          <p class="menu-meta">Live sample artifact: <a href="/api/verify/${escapeHtml(SAMPLE_ARTIFACT_ID)}"><code>${escapeHtml(SAMPLE_ARTIFACT_ID)}</code></a></p>
        </section>
        <section>
          <h2>${escapeHtml(COPY.mcpHead)}</h2>
          <p class="menu-desc">${escapeHtml(COPY.mcp)}</p>
        </section>
        <section>
          <h2>${escapeHtml(COPY.honestHead)}</h2>
          ${list(COPY.honest)}
          <p class="menu-desc">${escapeHtml(COPY.closer)}</p>
        </section>`,
      }),
    );
  }

  return c.json({
    title: COPY.title,
    summary: COPY.standfirst,
    protocol: {
      name: STORE_METADATA.protocol,
      version: "2",
      network: "eip155:8453",
      currency: STORE_METADATA.currency,
      sandbox: false,
      note: "No test mode. The same code path serves everyone, which is what makes it worth testing against.",
    },
    cheapest_settlement: low
      ? {
          item_id: low.id,
          price_usdc: low.price_usdc,
          buy: `${base}/api/buy/${low.id}?src=try`,
        }
      : undefined,
    flow,
    /**
     * BESIDE THE FLOW, not in a footnote. An agent reading this
     * payload top to bottom meets the guard immediately after the
     * three steps it is a guard on — which is before it writes the
     * loop, and that ordering is the whole point of the block.
     */
    retrying_safely: {
      head: COPY.retryHead,
      notes: COPY.retry,
      header: "Idempotency-Key",
      mcp_meta_key: "x402/idempotency-key",
      where_the_key_comes_from:
        "The idempotency.suggested_key field in the 402 body. Nothing to fetch first.",
      suggested_key_window_seconds: SUGGESTED_KEY_BUCKET_SECONDS,
      own_key_window_seconds: IDEMPOTENCY_TTL_SECONDS,
    },
    cheap_door: shelf.map((row) => ({
      ...row,
      buy: `${base}/api/buy/${row.id}?src=try`,
    })),
    verification: {
      verify_url_template: `${base}/api/verify/{cert_id}`,
      sample_artifact_id: SAMPLE_ARTIFACT_ID,
      sample_verify_url: `${base}/api/verify/${SAMPLE_ARTIFACT_ID}`,
      signing_key: `${base}/.well-known/scvd-signing-key`,
      listing_spec_schema: `${base}${SPEC_SCHEMA_PATH}`,
      openapi: `${base}/openapi.json`,
      x402_discovery: `${base}/.well-known/x402.json`,
    },
    mcp: {
      endpoint: `${base}/mcp`,
      transport: "streamable-http",
      free_methods: ["initialize", "tools/list"],
      note: COPY.mcp,
    },
    hand_rolling: HAND_ROLLING,
    when_you_are_stuck: {
      head: COPY.stuckHead,
      notes: COPY.stuck,
      item_id: "settlement_attestation",
      buy: `${base}/api/buy/settlement_attestation?tx_hash={0x…}&src=try`,
    },
    when_your_context_ends: {
      head: COPY.anchorHead,
      notes: COPY.anchor,
      what_survives: WHAT_SURVIVES,
      before_you_file: ANCHOR_CHECKLIST,
      item_id: "context_anchor",
      buy: `${base}/api/buy/context_anchor?summary={…}&src=try`,
    },
    honest_notes: COPY.honest,
    refund_policy: STORE_METADATA.refund_policy,
    mailbox: `${base}/api/letter`,
  });
});

/** The name a search engine is likelier to carry. Same room. */
practiceCounterRoutes.get("/x402-test", (c) => c.redirect("/try", 301));
