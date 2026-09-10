import { patronageCoordinator, type PreparedPatronage } from "@/services/patronage-recovery";
import { isPassId, newPassId } from "@/lib/ids";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvGet, kvGetJson, kvPut } from "@/lib/kv-retry";
import { signMessage } from "@/lib/signing";
import type { Env, PatronagePass } from "@/types";

/**
 * Recurring patronage: a 30-day standing pass. Buying recurring_patronage
 * mints a pass; buying again with pass_id extends the same pass by 30
 * days. While current, the pass URL serves the keeper's monthly note,
 * signed fresh on every read. The keeper writes the note from /admin.
 */

export const PASS_DAYS = 30;

const DEFAULT_MONTHLY_NOTE =
  "The keeper hasn't inked this month's note yet. It arrives the way all his deadlines do: eventually, and worth it. Your pass stands either way.";

export interface PassResult {
  pass: PatronagePass;
  renewed: boolean;
  commission: import("@/services/watch-recovery").WatchCommission;
  passUrl: string;
}

export interface PassInput {
  patronNumber: number;
  passId?: string;
  agentName?: string;
}

/** A renewal names an existing good. It must never turn into a new sale. */
export class InvalidPatronageTarget extends Error {
  readonly body = {
    code: "bad_request",
    charged: false,
    input_field: "pass_id",
    error: "pass_id must identify an existing patronage pass. Copy the exact ID from your pass receipt. Omit pass_id only to buy a new pass. Nothing charged.",
  };

  constructor() {
    super("Patronage renewal target is missing or invalid");
  }
}

export async function requireRenewalPass(env: Env, passId: string): Promise<PatronagePass> {
  const pass = isPassId(passId) ? await getPass(env, passId) : null;
  if (!pass) throw new InvalidPatronageTarget();
  return pass;
}

export async function createOrRenewPass(
  env: Env,
  input: PassInput,
  purchase?: { prepared: PreparedPatronage; certId: string },
): Promise<PassResult> {
  const prepared = purchase?.prepared ?? await preparePatronage(env, input.passId, input.agentName);
  const result = await patronageCoordinator(env, prepared.passId).grantPatronage({
    prepared, patronNumber: input.patronNumber, certId: purchase?.certId ?? `direct:${crypto.randomUUID()}`,
  });
  return { ...result, passUrl: `${env.STORE_BASE_URL}/api/patronage/${result.pass.pass_id}` };
}

export async function getPass(
  env: Env,
  passId: string,
): Promise<PatronagePass | null> {
  if (env.PAID_RECOVERIES) return patronageCoordinator(env, passId).readPatronage(passId);
  return kvGetJson<PatronagePass>(env.PATRONS, KV_KEYS.patronagePass(passId));
}

export function passIsCurrent(pass: PatronagePass): boolean {
  return Date.parse(pass.expires_at) > Date.now();
}

export interface SignedMonthlyNote {
  month: string;
  note: string;
  signature: string;
  public_key: string;
}

/** The current month's keeper note, signed fresh for the reader. */
export async function signedMonthlyNote(env: Env): Promise<SignedMonthlyNote> {
  const month = new Date().toISOString().slice(0, 7);
  const note =
    (await kvGet(env.COUNTERS, KV_KEYS.patronageNote(month))) ??
    DEFAULT_MONTHLY_NOTE;
  const { signature, publicKey } = await signMessage(
    JSON.stringify({ month, note }),
    env.SIGNING_KEY,
  );
  return { month, note, signature, public_key: publicKey };
}

export async function setMonthlyNote(env: Env, note: string): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  await kvPut(env.COUNTERS, KV_KEYS.patronageNote(month), note);
}

/** Capture the identity and original renewal target before buyer settlement. */
export async function preparePatronage(env: Env, passId?: string, agentName?: string): Promise<PreparedPatronage> {
  const existing = passId === undefined ? undefined : await requireRenewalPass(env, passId);
  if (existing && (!Number.isFinite(Date.parse(existing.expires_at)) || !Number.isFinite(Date.parse(existing.started_at)) ||
    !Number.isSafeInteger(existing.renewals) || existing.renewals < 0)) throw new Error("Original patronage terms unavailable");
  return { passId: existing?.pass_id ?? newPassId(), at: new Date().toISOString(),
    ...(existing ? { existing } : {}), ...(agentName !== undefined ? { agentName } : {}) };
}
