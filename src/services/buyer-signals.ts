import { KV_KEYS } from "@/lib/kv-keys";
import { kvGet, kvPut } from "@/lib/kv-retry";
import { metricsMonth, verifyAgeBucket } from "@/lib/metrics";
import { sanitizeText } from "@/lib/sanitize";
import { buyInputExample, buyInputSchema } from "@/lib/bazaar-discovery";
import type { Env, MenuItem } from "@/types";

/**
 * BUYER SIGNALS — a trial area, built to be stopped.
 *
 * Observed, never asked: what the till can see about buyers without
 * a cookie, an account or a question. Four readings, each a capped
 * map in one key per month, every write deferred beside the answer
 * (rule 50), house traffic excluded where a payer is known.
 *
 *   rail        which network settled, by door. The chosen rail against
 *               the rails offered is the spend-cap and SDK-default
 *               evidence the August abort papers said was invisible.
 *   refusal     pre-payment 400s by item and input field: the avoidable
 *               400 the cold waves counted by hand, counted live.
 *   reads       post-purchase reads — replay kits, order polls, status
 *               checks — bucketed by the artifact's age at the read.
 *               Whether anyone reads what they bought.
 *   purposes    the month's purpose statements, item and day beside
 *               each, no wallet. For the keeper's Sunday read; the
 *               only qualitative signal the store has.
 *   readers     who reads receipts (2026-09-18, the fourth signal):
 *               every /api/verify hit classed as browser, agent or
 *               crawler from headers the store already keeps, by the
 *               artifact's age, plus the referrer HOST it arrived
 *               from. A receipt shown in a Slack, an issue or a docs
 *               page leaves that host and nothing else. No pixel, no
 *               cookie, no script on the receipt: the receipt page's
 *               "nothing stored" stays true, because nothing new is
 *               collected — these headers were already on the event
 *               row for ninety days and never published.
 *   examples    inputs bought AS THE WORKED EXAMPLE, and refusals
 *               classed by why: missing, malformed, the example
 *               copied, or other. The cold walker that pasted
 *               example.com last week did the same thing; this
 *               counts it live, as a shape and never a value.
 *
 * WHAT IS NOT HERE, and why. Quote-to-pay latency needs the 402 and
 * the paid retry linked, and without a session the only link is a
 * timestamp echoed inside the accepted terms, which the signature
 * binds: a change to money. Client-from-handshake needs an MCP
 * session; the door is stateless. Both wait on a ruling.
 *
 * ONE DIAL, ONE PREFIX, ONE PAGE. Flip BUYER_SIGNALS_ENABLED and every
 * write stops; the keys sit under `metric:<month>:signals:` and expire
 * with the month's ledger; the page is /admin/signals and nothing
 * else reads these. Deleting the area is deleting this file, the page
 * and the six call sites that name it.
 */

/** ⚑ keeper dial. Off, nothing below writes and the page says so. */
export const BUYER_SIGNALS_ENABLED = true;

export const SIGNAL_MAP_CAP = 100;
export const PURPOSES_CAP = 200;

export type SignalKind = "rail" | "refusal" | "reads" | "readers" | "referrers" | "examples";
export type ReadKind = "replay" | "order_poll" | "purchase_status" | "check_order";
export type ReaderClass = "browser" | "agent" | "crawler";
export type RefusalReason = "missing" | "malformed" | "example" | "other";

export interface PurposeRow {
  item: string;
  day: string;
  purpose: string;
}

export interface BuyerSignals {
  enabled: boolean;
  month: string;
  rail: Record<string, number>;
  refusal: Record<string, number>;
  reads: Record<string, number>;
  /** `${class}:${age}` for every verify hit, house excluded. */
  readers: Record<string, number>;
  /** Referrer hosts on verify hits: where receipts are shown. */
  referrers: Record<string, number>;
  /** `${item}:${field}` bought with the worked example as the value. */
  examples: Record<string, number>;
  purposes: PurposeRow[];
  purposes_truncated: boolean;
  /** Read from the existing verify counters, not written here. */
  verify_age: Record<string, number>;
}

function key(kind: string, month: string): string {
  return KV_KEYS.metric(month, "signals", kind);
}

async function readMap(env: Env, kind: SignalKind, month: string): Promise<Record<string, number>> {
  const raw = await kvGet(env.COUNTERS, key(kind, month));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Read-modify-write on one key: a floor under contention, stated on the page. */
async function bumpMap(env: Env, kind: SignalKind, entry: string): Promise<void> {
  if (!BUYER_SIGNALS_ENABLED) return;
  const month = metricsMonth();
  const map = await readMap(env, kind, month);
  if (map[entry] === undefined && Object.keys(map).length >= SIGNAL_MAP_CAP) {
    map["other"] = (map["other"] ?? 0) + 1;
  } else {
    map[entry] = (map[entry] ?? 0) + 1;
  }
  await kvPut(env.COUNTERS, key(kind, month), JSON.stringify(map));
}

/** A stranger's string becomes part of a key: same scrub as the client census. */
function slug(raw: string | undefined, fallback: string): string {
  const cleaned = (raw ?? "").trim().toLowerCase().replace(/[^a-z0-9._:-]/g, "").slice(0, 40);
  return cleaned || fallback;
}

export interface SettleSignal {
  door: "http" | "mcp";
  network: string | undefined;
  item: string;
  purpose: string | undefined;
  house: boolean;
  /** Fields whose value was the published worked example, verbatim. */
  exampleCopied?: string[];
}

/**
 * One settled purchase: the rail by door, and the purpose if one was
 * written. House purchases are skipped whole — the family's own
 * wallets would be the loudest voice in a signal this quiet.
 */
export async function recordSettleSignal(env: Env, signal: SettleSignal): Promise<void> {
  if (!BUYER_SIGNALS_ENABLED || signal.house) return;
  await bumpMap(env, "rail", `${signal.door}:${slug(signal.network, "no_rail")}`);
  for (const field of signal.exampleCopied ?? []) {
    await bumpMap(env, "examples", `${slug(signal.item, "item")}:${slug(field, "field")}`);
  }
  const purpose = sanitizeText(signal.purpose, 280);
  if (!purpose) return;
  const month = metricsMonth();
  const raw = await kvGet(env.COUNTERS, key("purposes", month));
  let rows: PurposeRow[] = [];
  try {
    rows = raw ? (JSON.parse(raw) as PurposeRow[]) : [];
  } catch {
    rows = [];
  }
  if (!Array.isArray(rows)) rows = [];
  if (rows.length >= PURPOSES_CAP) return; // the cap is stated on the page; nothing is evicted
  rows.push({ item: signal.item, day: new Date().toISOString().slice(0, 10), purpose });
  await kvPut(env.COUNTERS, key("purposes", month), JSON.stringify(rows));
}

/**
 * WHY a field was refused, as a shape and never a value: absent,
 * failing the published pattern, the worked example pasted back, or
 * something else (an unpaired surrogate, a refused callback host).
 * The same value the door refused is classed here and dropped.
 */
export function refusalReason(item: MenuItem | undefined, field: string, value: unknown): RefusalReason {
  if (value === undefined || value === null) return "missing";
  const text = typeof value === "string" ? value : String(value);
  if (text.trim().length === 0) return "missing";
  if (item) {
    const example = buyInputExample(item)[field];
    if (example !== undefined && String(example) === text.trim()) return "example";
    const schema = buyInputSchema(item).properties[field];
    const pattern = schema && typeof schema === "object" && "pattern" in schema ? (schema as { pattern?: unknown }).pattern : undefined;
    if (typeof pattern === "string") {
      try {
        if (!new RegExp(pattern).test(text)) return "malformed";
      } catch {
        // An unusable pattern is the store's defect, not the buyer's: fall through.
      }
    }
  }
  return "other";
}

/** A pre-payment 400 at either door: the item, the field it named, and why. */
export async function recordInputRefusal(
  env: Env,
  item: MenuItem | undefined,
  itemId: string,
  body: Record<string, unknown>,
  value: unknown,
): Promise<void> {
  const field = typeof body["input_field"] === "string" ? body["input_field"] : typeof body["code"] === "string" ? body["code"] : "unnamed";
  const reason = typeof body["input_field"] === "string" ? refusalReason(item, field, value) : "other";
  await bumpMap(env, "refusal", `${slug(itemId, "item")}:${slug(field, "unnamed")}:${reason}`);
}

export interface ReceiptRead {
  reader: ReaderClass;
  /** The Referer header, if any. Only its hostname is kept. */
  referrer: string | undefined;
  /** The store's own hostname, so a link from our own pages counts as "own". */
  ownHost: string;
  mintedIso?: string;
  house: boolean;
}

/**
 * One read of a receipt at /api/verify. The class and the artifact's
 * age say who is looking (the buyer within the hour, somebody else a
 * week on); the referrer host says where it was shown. A hostname is
 * not a person, and nothing here is new: both headers were already on
 * the event row.
 */
export async function recordReceiptRead(env: Env, read: ReceiptRead): Promise<void> {
  if (!BUYER_SIGNALS_ENABLED || read.house) return;
  const age = read.mintedIso ? verifyAgeBucket(read.mintedIso, Date.now()) : "unknown_age";
  await bumpMap(env, "readers", `${read.reader}:${age}`);
  let host = "none";
  if (read.referrer) {
    try {
      const parsed = new URL(read.referrer).hostname.toLowerCase();
      host = parsed === read.ownHost.toLowerCase() ? "own" : parsed;
    } catch {
      host = "unparsable";
    }
  }
  await bumpMap(env, "referrers", slug(host, "unparsable"));
}

/** A read of something already bought, bucketed by how old it was. */
export async function recordPostPurchaseRead(env: Env, kind: ReadKind, mintedIso?: string): Promise<void> {
  const age = mintedIso ? verifyAgeBucket(mintedIso, Date.now()) : "unknown_age";
  await bumpMap(env, "reads", `${kind}:${age}`);
}

export async function readBuyerSignals(env: Env, month = metricsMonth()): Promise<BuyerSignals> {
  const [rail, refusal, reads, readers, referrers, examples, purposesRaw, ...verify] = await Promise.all([
    readMap(env, "rail", month),
    readMap(env, "refusal", month),
    readMap(env, "reads", month),
    readMap(env, "readers", month),
    readMap(env, "referrers", month),
    readMap(env, "examples", month),
    kvGet(env.COUNTERS, key("purposes", month)),
    ...["under_1h", "under_1d", "under_1w", "over_1w", "unknown_age"].map((bucket) =>
      kvGet(env.COUNTERS, KV_KEYS.metric(month, "verifyage", bucket)),
    ),
  ]);
  let purposes: PurposeRow[] = [];
  try {
    purposes = purposesRaw ? (JSON.parse(purposesRaw) as PurposeRow[]) : [];
  } catch {
    purposes = [];
  }
  if (!Array.isArray(purposes)) purposes = [];
  const verifyAge: Record<string, number> = {};
  ["under_1h", "under_1d", "under_1w", "over_1w", "unknown_age"].forEach((bucket, i) => {
    const n = Number(verify[i] ?? 0);
    if (Number.isFinite(n) && n > 0) verifyAge[bucket] = n;
  });
  return {
    enabled: BUYER_SIGNALS_ENABLED,
    month,
    rail,
    refusal,
    reads,
    readers,
    referrers,
    examples,
    purposes,
    purposes_truncated: purposes.length >= PURPOSES_CAP,
    verify_age: verifyAge,
  };
}
