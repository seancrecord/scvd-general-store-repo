import { Hono, type Context } from "hono";
import { readDiscoveryReport } from "@/discovery/sign-report";
import {
  DISCOVERY_INVENTORY_VERSION,
  GLOBAL_INVENTORIES_PER_MINUTE,
  INVENTORIES_PER_MINUTE,
  inventoryCandidates,
  inventoryOrigin,
} from "@/discovery/inventory";
import type { HonoEnv } from "@/types";

/**
 * /api/discovery — free inventory of another host's catalog doors.
 * GET is the document. POST fetches the candidate paths we already
 * inventory on ourselves, hashes what answered, and joins claims.
 * Unsigned. No scores. The signed report is not sold yet.
 */
export const discoveryRoutes = new Hono<HonoEnv>();

function doc(base: string) {
  return {
    title: "Discovery inventory",
    version: DISCOVERY_INVENTORY_VERSION,
    summary:
      "Send an origin. We GET the catalog paths we already inventory on ourselves (menu.json, x402, OpenAPI, A2A, llms.txt, skill.md, and the well-known cousins), hash what answered, extract identity claims, and join them. Free, no account, unsigned. Facts and disagreements, never a score.",
    method: "POST",
    url: `${base}/api/discovery/${DISCOVERY_INVENTORY_VERSION}`,
    request: {
      url: "REQUIRED. The https origin to inventory. Paths are ours — a caller does not choose what we fetch, only whose host.",
    },
    candidate_paths: inventoryCandidates().map((surface) => surface.path),
    rate_limit: `Two ceilings, both ours: ${INVENTORIES_PER_MINUTE} inventories/minute per isolate and ${GLOBAL_INVENTORIES_PER_MINUTE}/minute globally. Past either you get a 429 that says the budget is our cost bound, not a fact about their catalogs. One call fetches every candidate path.`,
    what_it_returns: [
      "Each candidate path: status, sha256 when the body was read, extracted claim values.",
      "Disagreements from the same join we run on ourselves — only_left / only_right, no score.",
      "derived.verdict: agree | conflict | not_observed (not_observed when fewer than two surfaces produced claims).",
    ],
    what_it_cannot_check: [
      "same_operator — refused (G2).",
      "Whether the live buy door still behaves like these catalogs.",
      "MCP cluster item ids — we do not call tools/list in your name.",
      "This store's own hostname — the platform kills self-fetch; CI joins our catalogs.",
    ],
    signed: false,
    next_steps: {
      self_row:
        "Our own catalogs are joined in CI. Probe this door from outside if you want a reading of us.",
      signed_report:
        `The signer is built. A report, once issued, is free to read at ${base}/api/discovery/report/{id}. The SKU that issues one is not priced yet — this door does not sell a signature.`,
    },
  };
}

discoveryRoutes.get(`/api/discovery/${DISCOVERY_INVENTORY_VERSION}`, (c) =>
  c.json(doc(c.env.STORE_BASE_URL)),
);
discoveryRoutes.get("/api/discovery", (c) => c.json(doc(c.env.STORE_BASE_URL)));

async function handle(c: Context<HonoEnv>) {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: 'Body must be JSON: {"url": "https://their-origin.example"}' },
      400,
    );
  }
  const url =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)["url"]
      : undefined;
  const result = await inventoryOrigin({
    rawUrl: url,
    env: c.env,
    at: new Date().toISOString(),
    clock: "injected-request-clock",
  });
  return c.json(result.body, result.status as 200, {
    "Cache-Control": "no-store",
  });
}

discoveryRoutes.post(`/api/discovery/${DISCOVERY_INVENTORY_VERSION}`, (c) =>
  handle(c),
);
discoveryRoutes.post("/api/discovery", (c) => handle(c));

discoveryRoutes.get("/api/discovery/report/:id", async (c) => {
  const record = await readDiscoveryReport(c.env, c.req.param("id"));
  if (!record) {
    return c.json(
      {
        error:
          "No discovery report under that id. The id rides the issue response; this door only reads.",
      },
      404,
    );
  }
  return c.json(record, 200, { "Cache-Control": "no-store" });
});
