import { recoverMessageAddress } from "viem";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import { normalizePayTo, payToDigest } from "@/lib/pay-to-digest";
import { listCorpus } from "@/services/corpus";
import type { CorpusRecord } from "@/services/corpus";
import type { WardHostResult } from "@/services/ward-round";
import type { Env } from "@/types";

/**
 * STANDING NOTES — the G2 ruling's §5
 * (docs/G2_OPERATOR_LINKING_RULING_2026-08.md, keeper-ruled
 * 2026-08-27): self-serve review and dispute, evidence-gated, no
 * keeper in the loop for the common case.
 *
 * Proof of control attaches a dated statement that rides BESIDE the
 * store's observation on every surface that shows it — their words
 * beside ours, NEVER replacing the observation. Two proofs, both
 * self-serve:
 *
 *   wallet_signature — EIP-191 personal_sign over a STATEMENT-BOUND
 *   challenge, recovery-based, EOA only (the claims door's recover
 *   discipline). Deliberately stateless where the claims door burns a
 *   single-use nonce: a payout can be stolen, so its challenge must
 *   burn; a note is idempotent content, so replaying its signature
 *   re-attaches the same words to the same subject and nothing else.
 *   Binding sha256(statement) into the signed message is what makes
 *   that true.
 *
 *   well_known — the host serves sha256(statement) at
 *   /.well-known/scvd-note.txt. Control of the host is control of
 *   the subject.
 *
 * A NOTE RIDES AN OBSERVATION. A subject the chain has never observed
 * is refused: with no observation there is nothing to stand beside.
 * This is the semantic rule AND the fence — the well-known fetch only
 * ever points at doors our own probes already visit, so this lane
 * adds no new reach.
 *
 * ONE note per subject, newest wins: the subject controls their own
 * words and may restate them; history of their statements is theirs
 * to keep, not ours to accumulate (rule 43 points at us too).
 * Escalations beyond a note (correction / context / stands) go
 * through the notice desk to the keeper, per the ruling.
 */

export const STANDING_NOTE_MAX_CHARS = 500;
export const WELL_KNOWN_NOTE_PATH = "/.well-known/scvd-note.txt";
const WELL_KNOWN_TIMEOUT_MS = 5000;

export interface StandingNote {
  /** `host:<host>` or `wallet:<pay-to digest>` — never a verbatim address. */
  subject: string;
  statement: string;
  attached_at: string;
  evidence: "wallet_signature" | "well_known";
  what_this_is:
    "A statement by the party who proved control of this subject. It stands beside this store's observation and never alters it.";
}

export class NoteRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404,
  ) {
    super(message);
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The signed message, statement-bound. Everything a signer commits to
 * is IN the text they read before signing — the subject, the exact
 * words (by hash), and what signing does.
 */
export function noteChallengeText(
  address: string,
  statementSha256: string,
): string {
  return [
    "scvd.store standing note v1",
    `wallet: ${normalizePayTo(address)}`,
    `statement-sha256: ${statementSha256}`,
    "",
    "Signing this attaches the statement to this wallet's observations on scvd.store. It stands beside the observations and never alters them.",
  ].join("\n");
}

function cleanStatement(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new NoteRefused("A note needs a statement.", 400);
  }
  // Plain text only: control characters stripped, length bounded. The
  // statement is served on public surfaces verbatim past this point.
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (cleaned.length > STANDING_NOTE_MAX_CHARS) {
    throw new NoteRefused(
      `A standing note is at most ${STANDING_NOTE_MAX_CHARS} characters; this one is ${cleaned.length}. Say the load-bearing part here and link the rest from your own site.`,
      400,
    );
  }
  return cleaned;
}

function hostsOf(record: CorpusRecord): WardHostResult[] {
  return (record.snapshot.round.hosts ?? []) as WardHostResult[];
}

function chainHasHost(records: CorpusRecord[], host: string): boolean {
  return records.some((record) =>
    hostsOf(record).some((row) => row.host === host),
  );
}

async function chainHasWalletDigest(
  records: CorpusRecord[],
  digest: string,
): Promise<boolean> {
  for (const record of records) {
    for (const row of hostsOf(record)) {
      const offer = row.offer;
      if (!offer) continue;
      if (offer.pay_to_digest?.includes(digest)) return true;
      for (const verbatim of offer.pay_to ?? []) {
        if ((await payToDigest(verbatim)) === digest) return true;
      }
    }
  }
  return false;
}

async function store(env: Env, note: StandingNote): Promise<StandingNote> {
  await kvPut(env.COUNTERS, KV_KEYS.standingNote(note.subject), JSON.stringify(note));
  return note;
}

export async function noteFor(
  env: Env,
  subject: string,
): Promise<StandingNote | null> {
  return kvGetJson<StandingNote>(env.COUNTERS, 
    KV_KEYS.standingNote(subject),
    "json",
  );
}

export async function attachWalletNote(
  env: Env,
  input: { address: unknown; statement: unknown; signature: unknown },
): Promise<StandingNote> {
  const statement = cleanStatement(input.statement);
  if (
    typeof input.address !== "string" ||
    !/^0x[0-9a-fA-F]{40}$/.test(input.address.trim())
  ) {
    throw new NoteRefused(
      "The wallet lane takes an EVM address (0x + 40 hex) and an EIP-191 personal_sign signature. A Solana address can attach its note through the host lane for now; say so at the notice desk if you need the wallet lane and we will say when it opens.",
      400,
    );
  }
  const address = normalizePayTo(input.address);
  if (typeof input.signature !== "string") {
    throw new NoteRefused(
      "Sign the challenge (GET /api/standing-note shows its exact shape) with the wallet and send the signature.",
      400,
    );
  }
  let recovered: string;
  try {
    recovered = await recoverMessageAddress({
      message: noteChallengeText(address, await sha256Hex(statement)),
      signature: input.signature as `0x${string}`,
    });
  } catch {
    throw new NoteRefused(
      "That signature did not parse. EIP-191 personal_sign over the exact challenge string, hex-encoded.",
      400,
    );
  }
  if (recovered.toLowerCase() !== address) {
    throw new NoteRefused(
      "The signature recovers to a different wallet than the one named. The challenge must be signed by the wallet the note is about.",
      403,
    );
  }
  const digest = await payToDigest(address);
  const records = await listCorpus(env);
  if (!(await chainHasWalletDigest(records, digest))) {
    throw new NoteRefused(
      "No signed round has observed a door advertising this address, so there is no observation for a note to stand beside. If a door of yours advertises it, the next weekly round will meet it.",
      404,
    );
  }
  return store(env, {
    subject: `wallet:${digest}`,
    statement,
    attached_at: new Date().toISOString(),
    evidence: "wallet_signature",
    what_this_is:
      "A statement by the party who proved control of this subject. It stands beside this store's observation and never alters it.",
  });
}

export async function attachHostNote(
  env: Env,
  input: { host: unknown; statement: unknown },
  fetchImpl: typeof fetch = fetch,
): Promise<StandingNote> {
  const statement = cleanStatement(input.statement);
  if (
    typeof input.host !== "string" ||
    input.host.length > 253 ||
    !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(input.host.trim())
  ) {
    throw new NoteRefused(
      "That is not a hostname this lane can use. Bare host, e.g. example.com.",
      400,
    );
  }
  const host = input.host.trim().toLowerCase();
  const records = await listCorpus(env);
  if (!chainHasHost(records, host)) {
    throw new NoteRefused(
      "No signed round has observed this host, so there is no observation for a note to stand beside — and this lane only ever knocks on doors the ward round has already visited.",
      404,
    );
  }
  const expected = await sha256Hex(statement);
  let body: string;
  try {
    const response = await fetchImpl(`https://${host}${WELL_KNOWN_NOTE_PATH}`, {
      signal: AbortSignal.timeout(WELL_KNOWN_TIMEOUT_MS),
      redirect: "manual",
    });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    body = await response.text();
  } catch (error) {
    throw new NoteRefused(
      `Could not read https://${host}${WELL_KNOWN_NOTE_PATH} (${String(
        error instanceof Error ? error.message : error,
      )}). Serve the statement's sha256 there and try again.`,
      403,
    );
  }
  if (!body.includes(expected)) {
    throw new NoteRefused(
      `https://${host}${WELL_KNOWN_NOTE_PATH} does not contain this statement's sha256 (${expected}). The file must carry that exact hex string; extra content around it is fine.`,
      403,
    );
  }
  return store(env, {
    subject: `host:${host}`,
    statement,
    attached_at: new Date().toISOString(),
    evidence: "well_known",
    what_this_is:
      "A statement by the party who proved control of this subject. It stands beside this store's observation and never alters it.",
  });
}

/**
 * The notes that ride one host's page: the host's own note, and the
 * note of any wallet its door advertises (looked up by digest — the
 * digest itself is not served).
 */
export async function notesForHost(
  env: Env,
  records: CorpusRecord[],
  host: string,
): Promise<{ hostNote: StandingNote | null; walletNote: StandingNote | null }> {
  const hostNote = await noteFor(env, `host:${host}`);
  let walletNote: StandingNote | null = null;
  for (let i = records.length - 1; i >= 0 && !walletNote; i -= 1) {
    const row = hostsOf(records[i]!).find((entry) => entry.host === host);
    if (!row?.offer) continue;
    const digests = row.offer.pay_to_digest
      ? row.offer.pay_to_digest
      : await Promise.all((row.offer.pay_to ?? []).map(payToDigest));
    for (const digest of digests) {
      walletNote = await noteFor(env, `wallet:${digest}`);
      if (walletNote) break;
    }
    break;
  }
  return { hostNote, walletNote };
}
