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

const PASS_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_MONTHLY_NOTE =
  "The keeper hasn't inked this month's note yet. It arrives the way all his deadlines do: eventually, and worth it. Your pass stands either way.";

export interface PassResult {
  pass: PatronagePass;
  renewed: boolean;
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
): Promise<PassResult> {
  const now = Date.now();
  if (input.passId !== undefined) {
    const existing = await getPass(env, input.passId);
    if (existing) {
      const currentExpiry = Date.parse(existing.expires_at);
      const extendFrom = Number.isNaN(currentExpiry)
        ? now
        : Math.max(currentExpiry, now);
      existing.expires_at = new Date(extendFrom + PASS_DAYS * DAY_MS)
        .toISOString();
      existing.renewals += 1;
      await kvPut(
        env.PATRONS,
        KV_KEYS.patronagePass(existing.pass_id),
        JSON.stringify(existing),
      );
      return {
        pass: existing,
        renewed: true,
        passUrl: `${env.STORE_BASE_URL}/api/patronage/${existing.pass_id}`,
      };
    }
    // This service may run after settlement. Do not label its failure
    // "uncharged"; the purchase door owns that state and recovery response.
    throw new Error("The purchased patronage renewal target is no longer available");
  }
  const pass: PatronagePass = {
    pass_id: newPassId(),
    patron_number: input.patronNumber,
    started_at: new Date(now).toISOString(),
    expires_at: new Date(now + PASS_DAYS * DAY_MS).toISOString(),
    renewals: 0,
  };
  if (input.agentName) {
    pass.agent_name = input.agentName;
  }
  await kvPut(
    env.PATRONS,
    KV_KEYS.patronagePass(pass.pass_id),
    JSON.stringify(pass),
  );
  return {
    pass,
    renewed: false,
    passUrl: `${env.STORE_BASE_URL}/api/patronage/${pass.pass_id}`,
  };
}

export async function getPass(
  env: Env,
  passId: string,
): Promise<PatronagePass | null> {
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
