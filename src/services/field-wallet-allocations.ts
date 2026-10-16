import {DurableObject} from "cloudflare:workers";
import {authorizationTypes} from "@x402/evm";
import {BASE_EVM, BASE_USDC, getFinalizedBlockNumber, getBlockTimestamp, usdcBalanceOf} from "@/lib/base-rpc";
import {jcsCanonicalize} from "@/lib/jcs";
import type {FieldSigner} from "@/services/launch-check";
import type {Env} from "@/types";

export const FIELD_ALLOCATION_PROGRAMS = ["contributions", "shopping", "studies", "credit", "launch_checks", "directory_walks"] as const;
export type FieldAllocationProgram = typeof FIELD_ALLOCATION_PROGRAMS[number];
type SigningRequest = Parameters<FieldSigner["signTypedData"]>[0];
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const NONCE = /^0x[0-9a-f]{64}$/i;
const MAX_SNAPSHOT_AGE_MS = 60 * 60 * 1000;
export const FIELD_ALLOCATION_LIMITS = `Allocations cover new Base USDC authorizations passing through this deployment's ${FIELD_ALLOCATION_PROGRAMS.length} field-wallet signing paths. They are persisted before signing, including failed or uncertain signing attempts. A hold stays until a finalized block after its expiry supplies the balance used for the next allocation; redemption alone does not release it early. Older authorizations, unsigned work commitments, accruing store credit, external scripts and direct wallet transfers are not reserved here. This is not full wallet coverage or permission to raise caps. No gas is paid.`;
export class FieldAllocationUnavailable extends Error {constructor() {super("Field wallet allocation unavailable");}}
function unavailable(): never {throw new FieldAllocationUnavailable();}
function integer(value: unknown): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(value)) return unavailable();
  const n = BigInt(value); if (n >= 2n ** 256n) return unavailable(); return n;
}
function request(wallet: string, args: SigningRequest, now: number) {
  if (!ADDRESS.test(wallet) || args.domain.chainId !== Number(BASE_EVM.caip2.split(":")[1]) || args.domain.verifyingContract.toLowerCase() !== BASE_USDC || args.domain.name !== "USD Coin" || args.domain.version !== "2" || args.primaryType !== "TransferWithAuthorization") return unavailable();
  if (jcsCanonicalize(args.types) !== jcsCanonicalize({TransferWithAuthorization: [...authorizationTypes.TransferWithAuthorization]})) return unavailable();
  const m = args.message;
  if (Object.keys(m).sort().join(",") !== "from,nonce,to,validAfter,validBefore,value" || typeof m.from !== "string" || m.from.toLowerCase() !== wallet.toLowerCase() || typeof m.to !== "string" || !ADDRESS.test(m.to) || typeof m.nonce !== "string" || !NONCE.test(m.nonce)) return unavailable();
  const amount = integer(m.value), after = integer(m.validAfter), before = integer(m.validBefore);
  if (amount <= 0n || after >= before || before > BigInt(Number.MAX_SAFE_INTEGER) || before * 1000n <= BigInt(now)) return unavailable();
  return {nonce:m.nonce.toLowerCase(), amount:amount.toString(), until:Number(before), terms:jcsCanonicalize({...args, message:{...m, from:m.from.toLowerCase(), to:m.to.toLowerCase(), nonce:m.nonce.toLowerCase()}})};
}
export async function readAllocationBalance(env: Env, wallet: string, now: number) {
  const block = await getFinalizedBlockNumber(env, BASE_EVM);
  const [at, balance] = await Promise.all([getBlockTimestamp(env, block, BASE_EVM), usdcBalanceOf(env, wallet, BASE_EVM, block)]);
  if (!Number.isSafeInteger(block) || block < 0 || !at || !Number.isSafeInteger(at.getTime()) || at.getTime() > now || now - at.getTime() > MAX_SNAPSHOT_AGE_MS || balance < 0n) return unavailable();
  return {block, timestamp:Math.floor(at.getTime()/1000), balance:balance.toString(), read_at:new Date(now).toISOString()};
}

/** One writer per paying wallet. External reads happen BEFORE the synchronous
 * check-and-insert, so concurrent calls cannot both spend the same remainder. */
export class FieldWalletAllocations extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS allocation_meta (id INTEGER PRIMARY KEY CHECK(id=1), wallet TEXT NOT NULL, block INTEGER NOT NULL, timestamp INTEGER NOT NULL, balance TEXT NOT NULL, read_at TEXT NOT NULL, started_at TEXT NOT NULL)");
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS allocations (nonce TEXT PRIMARY KEY, program TEXT NOT NULL, amount TEXT NOT NULL, valid_before INTEGER NOT NULL, terms TEXT NOT NULL)");
  }
  private meta() {return this.ctx.storage.sql.exec<{wallet:string;block:number;timestamp:number;balance:string;read_at:string;started_at:string}>("SELECT * FROM allocation_meta WHERE id=1").toArray()[0];}
  private held(nonce: string) {return this.ctx.storage.sql.exec<{terms:string;program:string}>("SELECT terms,program FROM allocations WHERE nonce=?",nonce).toArray()[0];}
  async reserve(wallet: string, program: FieldAllocationProgram, args: SigningRequest, now = Date.now()) {
    if (!FIELD_ALLOCATION_PROGRAMS.includes(program) || !Number.isSafeInteger(now) || now < 0) return unavailable();
    const r = request(wallet,args,now); wallet = wallet.toLowerCase();
    const prior = this.meta(); if (prior && prior.wallet !== wallet) return unavailable();
    const existing = this.held(r.nonce);
    if (existing) {
      if (existing.terms !== r.terms || existing.program !== program) return unavailable();
      return {reserved:true, reused:true};
    }
    let reading: Awaited<ReturnType<typeof readAllocationBalance>>;
    try {reading = await readAllocationBalance(this.env,wallet,now);} catch {return unavailable();}
    // A later RPC may finish first. Never let an older balance replace it.
    const current = this.meta();
    if (current && (current.wallet !== wallet || reading.block < current.block || reading.timestamp < current.timestamp || reading.block === current.block && (reading.balance !== current.balance || reading.timestamp !== current.timestamp))) return unavailable();
    const raced = this.held(r.nonce);
    if (raced) {
      if (raced.terms !== r.terms || raced.program !== program) return unavailable();
      return {reserved:true, reused:true};
    }
    return this.ctx.storage.transactionSync(() => {
      // Wall-clock expiry is insufficient: the balance must include all blocks
      // in which an old signature could still have transferred USDC.
      this.ctx.storage.sql.exec("DELETE FROM allocations WHERE valid_before < ?",reading.timestamp);
      let held = 0n;
      for (const row of this.ctx.storage.sql.exec<{amount:string}>("SELECT amount FROM allocations")) held += BigInt(row.amount);
      if (held + BigInt(r.amount) > BigInt(reading.balance)) return unavailable();
      this.ctx.storage.sql.exec("INSERT INTO allocation_meta(id,wallet,block,timestamp,balance,read_at,started_at) VALUES(1,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET block=excluded.block,timestamp=excluded.timestamp,balance=excluded.balance,read_at=excluded.read_at",wallet,reading.block,reading.timestamp,reading.balance,reading.read_at,current?.started_at ?? reading.read_at);
      this.ctx.storage.sql.exec("INSERT INTO allocations(nonce,program,amount,valid_before,terms) VALUES(?,?,?,?,?)",r.nonce,program,r.amount,r.until,r.terms);
      return {reserved:true,reused:false};
    });
  }
  /** No chain read, release, private nonce, recipient, signature or request. */
  summary() {
    const meta = this.meta();
    const programs = Object.fromEntries(FIELD_ALLOCATION_PROGRAMS.map(p=>[p,{count:0,amount_atomic:"0"}]));
    let total=0n;
    for (const row of this.ctx.storage.sql.exec<{program:string;amount:string}>("SELECT program,amount FROM allocations")) {
      const p=programs[row.program]; if (!p) return unavailable();
      p.count++; p.amount_atomic=String(BigInt(p.amount_atomic)+BigInt(row.amount)); total+=BigInt(row.amount);
    }
    return {started_at:meta?.started_at ?? null, balance_observed_at:meta?.read_at ?? null, finalized_block:meta?.block ?? null, balance_atomic:meta?.balance ?? null, held_atomic:String(total), programs, spendable_atomic:null, limits:FIELD_ALLOCATION_LIMITS};
  }
}
export function allocationLedger(env: Env, wallet: string) {
  if (!env.FIELD_WALLET_ALLOCATIONS || !ADDRESS.test(wallet)) return unavailable();
  return env.FIELD_WALLET_ALLOCATIONS.getByName(`${BASE_EVM.caip2}:${BASE_USDC}:${wallet.toLowerCase()}`);
}
/** Injected test signers stay at their existing seam; every production signer
 * is wrapped before use. A missing binding or RPC failure withholds signatures. */
export function allocatedFieldSigner(env: Env, signer: FieldSigner, program: FieldAllocationProgram): FieldSigner {
  return {address:signer.address, async signTypedData(args) {
    const intent = structuredClone(args);
    try {await allocationLedger(env,signer.address).reserve(signer.address,program,intent);} catch {return unavailable();}
    // Do not release on failure: the caller cannot prove that no signature escaped.
    return signer.signTypedData(intent);
  }};
}

export async function readFieldAllocationSummary(env: Env) {
  if (!env.FIELD_WALLET_KEY) return {status:"unprovisioned",limits:FIELD_ALLOCATION_LIMITS};
  try {
    const {fieldSignerFromKey} = await import("@/services/launch-check");
    const signer = await fieldSignerFromKey(env.FIELD_WALLET_KEY);
    const summary = await allocationLedger(env,signer.address).summary();
    return {status:summary.started_at ? "tracking" : "not_started", ...summary};
  } catch {return {status:"unavailable",limits:FIELD_ALLOCATION_LIMITS};}
}
