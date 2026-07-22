import { invertedTimestamp, KV_KEYS } from "@/lib/kv-keys";
import { isRecord } from "@/types";
import type { BazaarLedgerEntry, Env } from "@/types";

/**
 * Captures EXTENSION-RESPONSES headers from facilitator verify/settle
 * calls. The x402 core SDK only console.logs this header, so we tap the
 * global fetch once (a strict passthrough) and buffer anything observed;
 * the payment gate drains the buffer into KV after each settlement, and
 * /admin reads the ledger back. Entries expire after 30 days.
 */

const LEDGER_TTL_SECONDS = 30 * 24 * 60 * 60;
const BUFFER_CAP = 20;

interface Observation {
  operation: "verify" | "settle";
  observed_at: string;
  extensions: Record<string, unknown>;
}

let buffer: Observation[] = [];
let installed = false;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function operationFromUrl(url: string): "verify" | "settle" | null {
  const path = url.split("?")[0] ?? "";
  if (path.endsWith("/verify")) {
    return "verify";
  }
  if (path.endsWith("/settle")) {
    return "settle";
  }
  return null;
}

function decodeHeader(header: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(atob(header));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function installBazaarObserver(): void {
  if (installed) {
    return;
  }
  installed = true;
  const original = globalThis.fetch.bind(globalThis);
  const tapped = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const response = await original(input, init);
    const operation = operationFromUrl(requestUrl(input));
    if (operation) {
      const header = response.headers.get("EXTENSION-RESPONSES");
      const decoded = header ? decodeHeader(header) : null;
      if (decoded) {
        buffer.push({
          operation,
          observed_at: new Date().toISOString(),
          extensions: decoded,
        });
        if (buffer.length > BUFFER_CAP) {
          buffer = buffer.slice(-BUFFER_CAP);
        }
      }
    }
    return response;
  };
  globalThis.fetch = tapped as typeof fetch;
}

/** Called by the payment gate after settlement; writes what was seen. */
export async function persistBazaarObservations(
  env: Env,
  path: string,
): Promise<void> {
  const drained = buffer;
  buffer = [];
  for (const observation of drained) {
    const entry: BazaarLedgerEntry = { path, ...observation };
    await env.COUNTERS.put(
      KV_KEYS.bazaarLedger(invertedTimestamp(Date.now())),
      JSON.stringify(entry),
      { expirationTtl: LEDGER_TTL_SECONDS },
    );
  }
}

export async function listBazaarLedger(
  env: Env,
  limit = 20,
): Promise<BazaarLedgerEntry[]> {
  const listed = await env.COUNTERS.list({
    prefix: KV_KEYS.bazaarLedgerPrefix,
    limit,
  });
  const entries: BazaarLedgerEntry[] = [];
  for (const key of listed.keys) {
    const entry = await env.COUNTERS.get<BazaarLedgerEntry>(key.name, "json");
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
}
