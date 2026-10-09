import { recoverMessageAddress } from "viem";
import { jcsCanonicalize } from "@/lib/jcs";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import { listKeys } from "@/lib/kv-list";
import { normalizePayTo, payToDigest } from "@/lib/pay-to-digest";
import { checkProbeTarget } from "@/lib/probe-target";
import { isSweepableHost, recordAsk } from "@/services/asked-queue";
import { listCorpus, type CorpusRecord } from "@/services/corpus";
import { digestsOf } from "@/services/operator-facts";
import { sha256Hex, WELL_KNOWN_NOTE_PATH } from "@/services/standing-note";
import type { WardHostResult } from "@/services/ward-round";
import { isRecord, type Env } from "@/types";

export const DECLARATION_CAP = 100;
export const DECLARATION_PREFIX = "seller_declaration:v1:";
export const DECLARATION_LIMIT = "Two dated artifacts compared, not a finding of fraud or proof of host ownership. Wallet rotation, shared checkout addresses and stale declarations can explain a mismatch. Networks are declared context; this comparison checks address digests only.";
export class DeclarationRefused extends Error {
  constructor(readonly code: string, message: string, readonly status: 400 | 403 | 409 | 429 | 503 = 400) { super(message); }
}
export interface DeclarationInput {
  artifact: "seller_declaration";
  version: 1;
  host: string;
  declares: { pay_to: string[]; networks: string[]; valid_from: string };
}
export interface SellerDeclaration {
  artifact: "seller_declaration";
  version: 1;
  id: string;
  host: string;
  pay_to_digests: string[];
  networks: string[];
  valid_from: string;
  attached_at: string;
  evidence: "wallet_signature" | "well_known";
  proof_scope: string;
}
export interface DeclarationComparison {
  state: "match" | "mismatch" | "not_captured" | "not_probed" | "no_declaration";
  declaration: SellerDeclaration | null;
  observed: { sequence: number; week: string; observed_at: string; digest: string; pay_to_digests: string[] } | null;
  limitations: string;
}

export function parseDeclaration(raw: unknown, ownHost: string): DeclarationInput {
  if (!isRecord(raw) || raw.artifact !== "seller_declaration" || raw.version !== 1 || !isRecord(raw.declares)) throw new DeclarationRefused("invalid_declaration", "Send artifact seller_declaration, version 1, host and declares.");
  const host = typeof raw.host === "string" ? raw.host.trim().toLowerCase() : "";
  if (!isSweepableHost(host) || !checkProbeTarget(new URL(`https://${host}`), ownHost).ok) throw new DeclarationRefused("invalid_host", "Use a public bare hostname other than this store.");
  const { pay_to, networks, valid_from } = raw.declares;
  if (!Array.isArray(pay_to) || pay_to.length < 1 || pay_to.length > 20 || pay_to.some(a => typeof a !== "string" || !/^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(a))) throw new DeclarationRefused("invalid_addresses", "Declare 1–20 EVM or Solana receiving addresses.");
  if (!Array.isArray(networks) || networks.length < 1 || networks.length > 20 || networks.some(n => typeof n !== "string" || !/^[a-z0-9-]{3,8}:[a-zA-Z0-9_-]{1,32}$/.test(n))) throw new DeclarationRefused("invalid_networks", "Declare 1–20 namespace:reference network identifiers.");
  if (typeof valid_from !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(valid_from) || !Number.isFinite(Date.parse(valid_from)) || new Date(valid_from).toISOString() !== valid_from) throw new DeclarationRefused("invalid_date", "valid_from must be a UTC ISO timestamp with milliseconds.");
  return { artifact: "seller_declaration", version: 1, host, declares: { pay_to: [...new Set((pay_to as string[]).map(normalizePayTo))].sort(), networks: [...new Set(networks as string[])].sort(), valid_from } };
}
export function declarationChallenge(input: DeclarationInput): string {
  return `scvd.store seller declaration v1\n${jcsCanonicalize(input)}\n\nSigning publishes this declaration beside observations of the named host. It authorizes no payment and proves control only of the signing wallet.`;
}
export async function declarationProof(input: DeclarationInput) {
  const statement = declarationChallenge(input);
  return { statement, sha256: await sha256Hex(statement), well_known_path: WELL_KNOWN_NOTE_PATH };
}

/** Independent keys retain ordering under concurrent submissions. Never redate a replay.
 * The bounded history supports as-of comparisons without rewriting an old week. */
export async function declarationsFor(env: Env, host: string): Promise<SellerDeclaration[]> {
  const listed = await listKeys(env.COUNTERS, { prefix: `${DECLARATION_PREFIX}${host}:`, cap: DECLARATION_CAP });
  if (listed.truncated) throw new DeclarationRefused("history_unavailable", "Declaration history exceeds the read cap; no comparison is inferred.", 503);
  const rows = await Promise.all(listed.names.map(key => kvGetJson<SellerDeclaration>(env.COUNTERS, key, "json")));
  if (rows.some(row => !row)) throw new DeclarationRefused("history_unavailable", "A declaration record could not be read; retry later.", 503);
  return (rows as SellerDeclaration[]).sort((a, b) => a.valid_from.localeCompare(b.valid_from) || a.id.localeCompare(b.id));
}
export function declarationAt(rows: SellerDeclaration[], at: string): SellerDeclaration | null {
  const eligible = rows.filter(row => row.attached_at <= at && row.valid_from <= at);
  // Wallet control never displaces a host's own statement, even if a shared
  // checkout wallet later signs different words. The distinction is public.
  const domain = eligible.filter(row => row.evidence === "well_known");
  const candidates = domain.length ? domain : eligible;
  const latest = candidates.at(-1) ?? null;
  if (latest && candidates.some(row => row.id !== latest.id && row.valid_from === latest.valid_from)) throw new DeclarationRefused("history_unavailable", "Conflicting declarations share an effective timestamp; no comparison is inferred.", 503);
  return latest;
}
function lastProbe(records: CorpusRecord[], host: string, at: string) {
  return records.flatMap(record => ((record.snapshot.round.hosts ?? []) as WardHostResult[])
    .filter(row => row.host === host && row.verdict !== "not_probed")
    .map(row => ({ row, record, time: row.observed_at ?? record.snapshot.taken_at })))
    .filter(item => item.time <= at)
    .sort((a, b) => a.time.localeCompare(b.time) || a.record.snapshot.sequence - b.record.snapshot.sequence).at(-1);
}
export async function compareDeclaration(records: CorpusRecord[], host: string, declaration: SellerDeclaration | null, at: string): Promise<DeclarationComparison> {
  const result: DeclarationComparison = { state: "no_declaration", declaration, observed: null, limitations: DECLARATION_LIMIT };
  if (!declaration) return result;
  const last = lastProbe(records, host, at);
  if (!last || !last.row.observed_at || last.time < declaration.attached_at || last.time < declaration.valid_from) return { ...result, state: "not_probed" };
  const digests = await digestsOf(last.row);
  return { ...result, state: digests.length === 0 ? "not_captured" : digests.every(d => declaration.pay_to_digests.includes(d)) ? "match" : "mismatch",
    observed: { sequence: last.record.snapshot.sequence, week: last.record.snapshot.week, observed_at: last.time, digest: last.record.digest, pay_to_digests: [...new Set(digests)].sort() } };
}
export async function declarationComparison(env: Env, records: CorpusRecord[], host: string, now = new Date()): Promise<DeclarationComparison> {
  return compareDeclaration(records, host, declarationAt(await declarationsFor(env, host), now.toISOString()), now.toISOString());
}
async function verifyHost(input: DeclarationInput, hash: string, fetchImpl: typeof fetch): Promise<void> {
  try {
    const response = await fetchImpl(`https://${input.host}${WELL_KNOWN_NOTE_PATH}`, { redirect: "manual", signal: AbortSignal.timeout(5000), headers: { Accept: "text/plain" } });
    if (!response.ok) { await response.body?.cancel(); throw new Error(); }
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    let text = "";
    let size = 0;
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) { await reader.cancel(); throw new Error(); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    if (!text.split(/\s+/).includes(hash)) throw new Error();
  } catch { throw new DeclarationRefused("proof_failed", "Serve the exact statement SHA-256 as a whitespace-separated token in the well-known file (maximum 4096 bytes); redirects are refused.", 403); }
}
export async function attachDeclaration(env: Env, raw: unknown, now = new Date(), fetchImpl: typeof fetch = fetch): Promise<SellerDeclaration> {
  if (!isRecord(raw)) throw new DeclarationRefused("invalid_request", "Send a JSON object.");
  const input = parseDeclaration(raw.declaration, new URL(env.STORE_BASE_URL).host);
  const proof = await declarationProof(input);
  const rows = await declarationsFor(env, input.host);
  const existing = rows.find(row => row.id === proof.sha256 && row.evidence === raw.evidence);
  if (existing) return existing;
  // A fresh statement is required to rotate. Old signatures cannot become
  // newer declarations by being submitted again, nor predate our receipt.
  if (Math.abs(now.getTime() - Date.parse(input.declares.valid_from)) > 10 * 60_000) throw new DeclarationRefused("stale_statement", "Use a valid_from timestamp within ten minutes of submission, then prove that exact statement.", 409);
  if (rows.length >= DECLARATION_CAP) throw new DeclarationRefused("declaration_capacity", "This host reached its retained declaration cap; contact the notice desk.", 409);
  if (rows.some(row => row.valid_from >= input.declares.valid_from)) throw new DeclarationRefused("older_statement", "Use a valid_from later than the retained declaration; old statements cannot replace newer ones.", 409);
  if (raw.evidence === "well_known") await verifyHost(input, proof.sha256, fetchImpl);
  else if (raw.evidence === "wallet_signature") {
    if (rows.some(row => row.evidence === "well_known")) throw new DeclarationRefused("host_proof_required", "This host has published its own declaration. Restate through the host lane.", 403);
    const signatures = raw.signatures;
    if (!isRecord(signatures)) throw new DeclarationRefused("invalid_signatures", "Send signatures keyed by every normalized declared EVM address; use host proof for Solana.");
    const last = lastProbe(await listCorpus(env), input.host, now.toISOString());
    const observed = last ? await digestsOf(last.row) : [];
    for (const address of input.declares.pay_to) {
      if (!/^0x[0-9a-f]{40}$/.test(address) || typeof signatures[address] !== "string") throw new DeclarationRefused("invalid_signatures", "Every declared address needs its own EVM signature; use host proof for Solana.");
      if (!observed.includes(await payToDigest(address))) throw new DeclarationRefused("host_proof_required", "Wallet proof requires each declared address in the last observed payment challenge for this host. Use host proof for new hosts or rotations.", 403);
      let recovered = "";
      try { recovered = await recoverMessageAddress({ message: proof.statement, signature: signatures[address] as `0x${string}` }); } catch { /* fixed refusal below */ }
      if (recovered.toLowerCase() !== address) throw new DeclarationRefused("proof_failed", "A signature does not match the named wallet and exact statement.", 403);
    }
  } else throw new DeclarationRefused("invalid_evidence", "evidence must be well_known or wallet_signature.");
  const row: SellerDeclaration = { artifact: input.artifact, version: 1, id: proof.sha256, host: input.host,
    pay_to_digests: await Promise.all(input.declares.pay_to.map(payToDigest)), networks: input.declares.networks,
    valid_from: input.declares.valid_from, attached_at: now.toISOString(), evidence: raw.evidence,
    proof_scope: raw.evidence === "well_known" ? "Control of this host at attachment." : "Control of each declared wallet observed at this host; not control of the host." };
  await kvPut(env.COUNTERS, `${DECLARATION_PREFIX}${input.host}:${row.id}:${row.evidence}`, JSON.stringify(row));
  await recordAsk(env, input.host, "seller_declaration", now);
  return row;
}

/** Read declarations once for a weekly comparison, rather than one list per host.
 * A capped or missing read refuses the result; zero never conceals missing rows. */
export async function declarationWeekChanges(env: Env, records: CorpusRecord[], week: string) {
  const { weeklyCorpus } = await import("@/services/corpus-list");
  const weeks = weeklyCorpus(records);
  const index = weeks.findIndex(record => record.snapshot.week === week);
  const current = weeks[index];
  const previous = weeks[index - 1];
  const listed = await listKeys(env.COUNTERS, { prefix: DECLARATION_PREFIX, cap: 2000 });
  if (listed.truncated) throw new DeclarationRefused("history_unavailable", "The weekly declaration comparison exceeded its read cap.", 503);
  const rows = await Promise.all(listed.names.map(key => kvGetJson<SellerDeclaration>(env.COUNTERS, key, "json")));
  if (rows.some(row => !row)) throw new DeclarationRefused("history_unavailable", "A declaration is unavailable; retry the weekly comparison.", 503);
  const groups = new Map<string, SellerDeclaration[]>();
  for (const row of rows as SellerDeclaration[]) groups.set(row.host, [...(groups.get(row.host) ?? []), row]);
  let compared = 0;
  const mismatches: { host: string; before: DeclarationComparison; after: DeclarationComparison }[] = [];
  if (current) for (const [host, declarations] of groups) {
    declarations.sort((a, b) => a.valid_from.localeCompare(b.valid_from) || a.id.localeCompare(b.id));
    const after = await compareDeclaration([current], host, declarationAt(declarations, current.snapshot.taken_at), current.snapshot.taken_at);
    if (after.state !== "match" && after.state !== "mismatch") continue;
    compared++;
    const before = previous ? await compareDeclaration([previous], host, declarationAt(declarations, previous.snapshot.taken_at), previous.snapshot.taken_at)
      : { state: "no_declaration" as const, declaration: null, observed: null, limitations: DECLARATION_LIMIT };
    if (after.state === "mismatch" && before.state !== "mismatch") mismatches.push({ host, before, after });
  }
  return { declaration_mismatches: mismatches.sort((a, b) => a.host.localeCompare(b.host)), declarations_compared: compared,
    declaration_comparison_scope: "Hosts with an effective declaration and a captured address in this signed week. The previous signed week supplies the earlier state. Declarations attached later never change an earlier week; this derived comparison is unsigned." };
}
