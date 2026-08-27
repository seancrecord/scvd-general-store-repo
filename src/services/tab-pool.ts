import { sendAlert } from "@/lib/alerts";
import { KV_KEYS } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { signMessage } from "@/lib/signing";
import {
  TAB_DELTA_FIELDS,
  TAB_DELTA_KINDS,
  TAB_DELTA_OUTCOMES,
  TAB_POOL_DAILY_CAP,
  TAB_POOL_SCAN_CAP,
  TAB_POOL_TRUST_LINE,
  TAB_SIGNUP_FRICTION,
  type TabDeltaKind,
} from "@/store/tab-pool";
import type { Env } from "@/types";
import { kvPut } from "@/lib/kv-retry";

/**
 * THE AGGREGATION ENDPOINT's working half (layer 3). The Tab's spec
 * is explicit about where enforcement lives: "contribute-to-access is
 * enforced by the AGGREGATION ENDPOINT, which knows who has
 * contributed. The local server honors the consent event, but a local
 * file is editable by whoever owns it."
 *
 * How this endpoint "knows who has contributed" WITHOUT an account:
 * the receipt. Every accepted delta gets an ed25519-signed receipt —
 * "an anonymized delta matching this digest was accepted at this
 * time" — and the receipt is the ticket. Pooled reads, when they
 * ship, take a receipt and verify the signature statelessly; no
 * identity is stored, so two deltas from one contributor stay as
 * unlinkable as the spec demands. Signed custody of the contribution,
 * never a claim about the tool.
 */

export interface TabDelta {
  kind: TabDeltaKind;
  tool_name: string;
  category: string;
  week?: string;
  signup_friction?: string;
  outcome?: string;
  weeks_held?: number;
  replaced_with?: string;
}

/**
 * The server-side twin of the client's validator — deliberately
 * restated rather than shared, because the published client drifts
 * from this repo's HEAD the day somebody installs it, and THIS door
 * is the one a tampered local file cannot edit its way around.
 */
export function validateDelta(
  body: unknown,
): { delta: TabDelta } | { problems: string[] } {
  const problems: string[] = [];
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { problems: ["the delta must be a JSON object."] };
  }
  const input = body as Record<string, unknown>;
  const kind = input["kind"];
  if (kind !== "opened" && kind !== "outcome") {
    return {
      problems: [`kind must be one of: ${TAB_DELTA_KINDS.join(", ")}.`],
    };
  }
  // Allowlist first (the client's red team F2, held on this side too):
  // an undeclared field is refused BY NAME, never forwarded, never
  // quietly dropped — dropping would teach a broken client it is fine.
  const allowed = TAB_DELTA_FIELDS[kind];
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      problems.push(
        `unexpected field "${key}" — a ${kind} delta carries only ${allowed.join(", ")}. Prices, notes and identities never ride a delta.`,
      );
    }
  }
  const name = typeof input["tool_name"] === "string" ? input["tool_name"].trim().toLowerCase() : "";
  if (name === "" || name.length > 60) {
    problems.push("tool_name is required: lowercase, at most 60 characters.");
  }
  /**
   * The category is capped and lowercased, NOT checked against the
   * client's vocabulary — hand-copying that list here is exactly the
   * drift rule 1 forbids, and a junk category cannot hide anyway:
   * sample sizes ride every published figure, so a category of one
   * says one.
   */
  const category = typeof input["category"] === "string" ? input["category"].trim().toLowerCase() : "";
  if (category === "" || category.length > 40) {
    problems.push("category is required: lowercase, at most 40 characters.");
  }
  if (kind === "opened") {
    if (!/^\d{4}-W\d{2}$/.test(String(input["week"] ?? ""))) {
      problems.push('opened deltas carry week as an ISO week key, e.g. "2026-W32" — never a finer date.');
    }
    if (
      input["signup_friction"] !== undefined &&
      !TAB_SIGNUP_FRICTION.includes(input["signup_friction"] as (typeof TAB_SIGNUP_FRICTION)[number])
    ) {
      problems.push(`signup_friction must be one of: ${TAB_SIGNUP_FRICTION.join(", ")}.`);
    }
  }
  if (kind === "outcome") {
    if (!TAB_DELTA_OUTCOMES.includes(input["outcome"] as (typeof TAB_DELTA_OUTCOMES)[number])) {
      problems.push(`outcome must be one of: ${TAB_DELTA_OUTCOMES.join(", ")} — a resolution, not a feeling.`);
    }
    const weeks = input["weeks_held"];
    if (!Number.isInteger(weeks) || (weeks as number) < 0 || (weeks as number) > 1040) {
      problems.push("weeks_held must be an integer between 0 and 1040, rounded to weeks.");
    }
    if (
      input["replaced_with"] !== undefined &&
      (typeof input["replaced_with"] !== "string" || input["replaced_with"].length > 60)
    ) {
      problems.push("replaced_with must be a tool name, at most 60 characters.");
    }
  }
  if (problems.length > 0) return { problems };
  const delta: TabDelta = { kind, tool_name: name, category };
  if (kind === "opened") {
    delta.week = String(input["week"]);
    if (input["signup_friction"] !== undefined) {
      delta.signup_friction = String(input["signup_friction"]);
    }
  } else {
    delta.outcome = String(input["outcome"]);
    delta.weeks_held = input["weeks_held"] as number;
    if (input["replaced_with"] !== undefined) {
      delta.replaced_with = String(input["replaced_with"]).trim().toLowerCase();
    }
  }
  return { delta };
}

/**
 * The canonical form the digest and the receipt both stand on: the
 * kind's declared field order, no others. Served back to the
 * contributor as signed_payload so verification never reconstructs.
 */
export function canonicalDelta(delta: TabDelta): string {
  const record = delta as unknown as Record<string, unknown>;
  return JSON.stringify(
    Object.fromEntries(
      TAB_DELTA_FIELDS[delta.kind]
        .filter((field) => record[field] !== undefined)
        .map((field) => [field, record[field]]),
    ),
  );
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export interface TabDeltaReceipt {
  receipt_id: string;
  delta_digest: string;
  kind: TabDeltaKind;
  received_at: string;
  statement: string;
  trust_line: string;
}

export interface AcceptedDelta {
  receipt: TabDeltaReceipt;
  signed_payload: string;
  signature: string;
  public_key: string;
}

/** The key's category segment: safe charset, never the raw string. */
function safeCategory(category: string): string {
  return category.replace(/[^a-z0-9_-]/g, "_").slice(0, 40) || "other";
}

export async function acceptDelta(
  env: Env,
  delta: TabDelta,
  now: Date = new Date(),
): Promise<AcceptedDelta | { refused: string }> {
  /**
   * The flood gate, before any write. The counter's read-increment
   * can race across isolates and admit a handful over the line —
   * acceptable for a gate whose job is stopping a firehose, not
   * metering a fee. Money is not moving here; decoration fails open,
   * gates fail approximately.
   */
  const day = now.toISOString().slice(0, 10);
  const dayKey = KV_KEYS.tabPoolDay(day);
  const taken = Number((await env.COUNTERS.get(dayKey)) ?? "0");
  if (taken >= TAB_POOL_DAILY_CAP) {
    await sendAlert(env, {
      condition: "worker_health",
      detail: `TAB POOL AT ITS DAILY CAP: ${taken} deltas accepted today and the gate is now refusing. Either the Tab found an audience or somebody is filling the pool — look at the tab_delta: rows before raising TAB_POOL_DAILY_CAP.`,
    }).catch(() => undefined);
    return {
      refused:
        "The pool has taken its daily fill and the gate is closed until tomorrow (UTC). Nothing was recorded; send the delta again after the turn of the day.",
    };
  }
  await kvPut(env.COUNTERS, dayKey, String(taken + 1), {
    expirationTtl: 3 * 86400,
  });

  const canonical = canonicalDelta(delta);
  const digest = await sha256Hex(canonical);
  const receiptId = `tabr_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const receipt: TabDeltaReceipt = {
    receipt_id: receiptId,
    delta_digest: `sha256:${digest}`,
    kind: delta.kind,
    received_at: now.toISOString(),
    statement:
      "An anonymized delta matching this digest was accepted at this time. Signed custody of the contribution, never a claim about the tool.",
    trust_line: TAB_POOL_TRUST_LINE,
  };
  const signedPayload = JSON.stringify(receipt);
  const { signature, publicKey } = await signMessage(
    signedPayload,
    env.SIGNING_KEY,
  );
  // The corpus row: kind and category ride in the key so sample sizes
  // derive from a listing alone, no bulk read.
  await kvPut(env.COUNTERS, 
    KV_KEYS.tabDelta(delta.kind, safeCategory(delta.category), receiptId),
    JSON.stringify({ delta, digest, received_at: receipt.received_at }),
  );
  return { receipt, signed_payload: signedPayload, signature, public_key: publicKey };
}

export interface PoolSample {
  opened: number;
  outcome: number;
  by_category: Record<string, { opened: number; outcome: number }>;
  truncated: boolean;
}

/** Sample sizes off the key names alone — the honest face's arithmetic. */
export async function poolSample(env: Env): Promise<PoolSample> {
  const listed = await listKeys(env.COUNTERS, {
    prefix: KV_KEYS.tabDeltaPrefix,
    cap: TAB_POOL_SCAN_CAP,
  });
  const sample: PoolSample = {
    opened: 0,
    outcome: 0,
    by_category: {},
    truncated: listed.names.length >= TAB_POOL_SCAN_CAP,
  };
  for (const name of listed.names) {
    const [kind, category] = name.slice(KV_KEYS.tabDeltaPrefix.length).split(":");
    if (kind !== "opened" && kind !== "outcome") continue;
    sample[kind] += 1;
    const row = (sample.by_category[category ?? "other"] ??= {
      opened: 0,
      outcome: 0,
    });
    row[kind] += 1;
  }
  return sample;
}
