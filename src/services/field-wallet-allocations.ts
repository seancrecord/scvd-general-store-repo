import {DurableObject} from "cloudflare:workers";
import {authorizationTypes} from "@x402/evm";
import {BASE_EVM, BASE_USDC, getFinalizedBlockNumber, getBlockTimestamp, usdcBalanceOf, getReceipt, getChainId, getBlockHash} from "@/lib/base-rpc";
import {readAuthorizationReceipt} from "@/lib/authorization-receipt";
import {jcsCanonicalize} from "@/lib/jcs";
import type {FieldSigner} from "@/services/launch-check";
import type {Env} from "@/types";

export const FIELD_ALLOCATION_PROGRAMS = ["contributions", "shopping", "studies", "credit", "launch_checks", "directory_walks"] as const;
export type FieldAllocationProgram = typeof FIELD_ALLOCATION_PROGRAMS[number];
export interface ContributionFundingRelease {transaction:string; receipt_block:number; receipt_block_hash:string; finalized_block:number; balance_atomic:string; read_at:string}
type ReleaseRow = {id:string; data:string};
type Commitment = {id:string; recipient:string; amount:string; nonce:string | null};
type SigningRequest = Parameters<FieldSigner["signTypedData"]>[0];
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const NONCE = /^0x[0-9a-f]{64}$/i;
const MAX_SNAPSHOT_AGE_MS = 60 * 60 * 1000;
export const FIELD_ALLOCATION_LIMITS = `Allocations cover new Base USDC authorizations passing through this deployment's ${FIELD_ALLOCATION_PROGRAMS.length} field-wallet signing paths. They are persisted before signing, including failed or uncertain signing attempts. A hold stays until a finalized block after its expiry supplies the balance used for the next allocation; redemption alone does not release it early. New signed-authorization contribution acceptances also hold funds through issuance and expiry. A separate private funding reconciliation releases an acceptance hold only after matching its exact transfer in a canonical finalized block and retaining a balance at or after that payment. Payment observations alone do not release holds. Older authorizations and acceptances, work not yet accepted, legacy manual-payment briefs, accruing store credit, external scripts and direct wallet transfers are not reserved here. This is not full wallet coverage or permission to raise caps. No gas is paid.`;
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
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS contribution_commitments (id TEXT PRIMARY KEY, recipient TEXT NOT NULL, amount TEXT NOT NULL, nonce TEXT UNIQUE)");
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS contribution_releases (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
  }
  private released(id: string): ContributionFundingRelease | undefined {const row=this.ctx.storage.sql.exec<ReleaseRow>("SELECT * FROM contribution_releases WHERE id=?",id).toArray()[0];return row ? JSON.parse(row.data) as ContributionFundingRelease : undefined;}
  private commitment(id: string) {return this.ctx.storage.sql.exec<Commitment>("SELECT * FROM contribution_commitments WHERE id=?",id).toArray()[0];}
  private holds() {return this.ctx.storage.sql.exec<{program:string;amount:string}>("SELECT program,amount FROM allocations WHERE nonce NOT IN (SELECT nonce FROM contribution_commitments WHERE nonce IS NOT NULL) UNION ALL SELECT 'contributions' AS program,amount FROM contribution_commitments WHERE id NOT IN (SELECT id FROM contribution_releases)");}
  private meta() {return this.ctx.storage.sql.exec<{wallet:string;block:number;timestamp:number;balance:string;read_at:string;started_at:string}>("SELECT * FROM allocation_meta WHERE id=1").toArray()[0];}
  private held(nonce: string) {return this.ctx.storage.sql.exec<{terms:string;program:string}>("SELECT terms,program FROM allocations WHERE nonce=?",nonce).toArray()[0];}
  private async balance(wallet: string, now: number) {
    const prior=this.meta(); if (prior && prior.wallet !== wallet) return unavailable();
    let reading: Awaited<ReturnType<typeof readAllocationBalance>>;
    try {reading=await readAllocationBalance(this.env,wallet,now);} catch {return unavailable();}
    const current=this.meta();
    if (current && (current.wallet !== wallet || reading.block < current.block || reading.timestamp < current.timestamp || reading.block === current.block && (reading.balance !== current.balance || reading.timestamp !== current.timestamp))) return unavailable();
    return reading;
  }
  private retainBalance(wallet: string, reading: Awaited<ReturnType<typeof readAllocationBalance>>) {
    const current=this.meta();
    if (current && (current.wallet!==wallet || reading.block<current.block || reading.timestamp<current.timestamp || reading.block===current.block && (reading.balance!==current.balance || reading.timestamp!==current.timestamp))) return unavailable();
    this.ctx.storage.sql.exec("INSERT INTO allocation_meta(id,wallet,block,timestamp,balance,read_at,started_at) VALUES(1,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET block=excluded.block,timestamp=excluded.timestamp,balance=excluded.balance,read_at=excluded.read_at",wallet,reading.block,reading.timestamp,reading.balance,reading.read_at,this.meta()?.started_at ?? reading.read_at);
  }
  private capacity(wallet: string, reading: Awaited<ReturnType<typeof readAllocationBalance>>, additional: bigint) {
    this.retainBalance(wallet,reading);
    // Only unlinked authorization holds expire. An accepted contribution remains
    // owed until its payment is reconciled, even after its signature expires.
    this.ctx.storage.sql.exec("DELETE FROM allocations WHERE valid_before < ? AND nonce NOT IN (SELECT nonce FROM contribution_commitments WHERE nonce IS NOT NULL)",reading.timestamp);
    let held=0n; for (const row of this.holds()) held+=BigInt(row.amount);
    if (held+additional > BigInt(reading.balance)) return unavailable();
  }
  /** Acceptance owns a permanent identity. A failed response can be retried
   * without allocating again; neither deadlines nor signing release the debt. */
  async commitContribution(wallet: string, id: string, recipient: string, amount: string, now=Date.now()) {
    if (!ADDRESS.test(wallet) || !ADDRESS.test(recipient) || /^0x0{40}$/i.test(recipient) || !/^[a-z0-9-]{3,64}:[a-f0-9-]{36}$/.test(id) || integer(amount)<=0n || !Number.isSafeInteger(now) || now<0) return unavailable();
    wallet=wallet.toLowerCase(); recipient=recipient.toLowerCase();
    const matches=(row:Commitment)=>{if(row.recipient!==recipient || row.amount!==amount) return unavailable();return {reserved:true,reused:true};};
    if(this.meta()?.wallet && this.meta()!.wallet!==wallet) return unavailable();
    const old=this.commitment(id);if(old) {if(this.released(id)) return unavailable();return matches(old);}
    const reading=await this.balance(wallet,now);
    const raced=this.commitment(id);if(raced) {if(this.released(id)) return unavailable();return matches(raced);}
    return this.ctx.storage.transactionSync(()=>{
      this.capacity(wallet,reading,BigInt(amount));
      this.ctx.storage.sql.exec("INSERT INTO contribution_commitments(id,recipient,amount,nonce) VALUES(?,?,?,NULL)",id,recipient,amount);
      return {reserved:true,reused:false};
    });
  }
  async reserve(wallet: string, program: FieldAllocationProgram, args: SigningRequest, now = Date.now(), commitmentId?: string) {
    if (!FIELD_ALLOCATION_PROGRAMS.includes(program) || !Number.isSafeInteger(now) || now < 0) return unavailable();
    const r=request(wallet,args,now);wallet=wallet.toLowerCase();
    if(this.meta()?.wallet && this.meta()!.wallet!==wallet) return unavailable();
    const commitment=commitmentId === undefined ? undefined : this.commitment(commitmentId);
    if(commitmentId !== undefined && (!commitment || program!=="contributions" || commitment.amount!==r.amount || commitment.recipient!==String(args.message.to).toLowerCase() || commitment.nonce!==null && commitment.nonce!==r.nonce)) return unavailable();
    if(this.ctx.storage.sql.exec("SELECT 1 FROM contribution_commitments c JOIN contribution_releases r ON r.id=c.id WHERE c.nonce=?",r.nonce).toArray().length) return unavailable();
    const existing=this.held(r.nonce);
    if(existing) {
      if(existing.terms!==r.terms || existing.program!==program || commitment && commitment.nonce!==r.nonce) return unavailable();
      return {reserved:true,reused:true};
    }
    const reading=await this.balance(wallet,now);
    if(this.ctx.storage.sql.exec("SELECT 1 FROM contribution_commitments c JOIN contribution_releases r ON r.id=c.id WHERE c.nonce=?",r.nonce).toArray().length) return unavailable();
    const raced=this.held(r.nonce);
    if(raced) {
      if(raced.terms!==r.terms || raced.program!==program || commitmentId && this.commitment(commitmentId)?.nonce!==r.nonce) return unavailable();
      return {reserved:true,reused:true};
    }
    return this.ctx.storage.transactionSync(()=>{
      const fresh=commitmentId === undefined ? undefined : this.commitment(commitmentId);
      if(commitmentId !== undefined && (!fresh || fresh.nonce!==null && fresh.nonce!==r.nonce)) return unavailable();
      this.capacity(wallet,reading,fresh ? 0n : BigInt(r.amount));
      if(fresh) this.ctx.storage.sql.exec("UPDATE contribution_commitments SET nonce=? WHERE id=?",r.nonce,commitmentId!);
      this.ctx.storage.sql.exec("INSERT INTO allocations(nonce,program,amount,valid_before,terms) VALUES(?,?,?,?,?)",r.nonce,program,r.amount,r.until,r.terms);
      return {reserved:true,reused:false};
    });
  }
  /** Read the chain ourselves, using the immutable hold rather than a supplied
   * confirmation. Keep both identities as tombstones so retries cannot re-fund
   * or re-sign a released reward. No signature, broadcast or key is needed. */
  async releaseContribution(wallet: string, id: string, transaction: string, now=Date.now()): Promise<ContributionFundingRelease> {
    if(!ADDRESS.test(wallet) || !NONCE.test(transaction) || !Number.isSafeInteger(now) || now<0) return unavailable();
    wallet=wallet.toLowerCase();transaction=transaction.toLowerCase();
    const commitment=this.commitment(id),meta=this.meta();
    if(!commitment?.nonce || !meta || meta.wallet!==wallet) return unavailable();
    const previous=this.released(id);
    if(previous) {if(previous.transaction!==transaction) return unavailable();return previous;}
    const allocation=this.held(commitment.nonce);
    if(!allocation || allocation.program!=="contributions") return unavailable();
    let reading:Awaited<ReturnType<typeof readAllocationBalance>>, receipt:Awaited<ReturnType<typeof getReceipt>>, chainId:string;
    try {[reading,receipt,chainId]=await Promise.all([this.balance(wallet,now),getReceipt(this.env,transaction,BASE_EVM),getChainId(this.env,BASE_EVM)]);}catch{return unavailable();}
    const exact=readAuthorizationReceipt(receipt,reading.block,chainId,transaction,{network:BASE_EVM.caip2,asset:BASE_USDC,payer:wallet,recipient:commitment.recipient,nonce:commitment.nonce,amount_atomic:commitment.amount},BASE_EVM);
    if(exact.status!=="matched" || !receipt?.blockHash || !NONCE.test(receipt.blockHash)) return unavailable();
    const block=Number.parseInt(receipt.blockNumber,16);
    let hash:string;try {hash=await getBlockHash(this.env,block,BASE_EVM);}catch{return unavailable();}
    if(hash!==receipt.blockHash.toLowerCase()) return unavailable();
    const result:ContributionFundingRelease={transaction,receipt_block:block,receipt_block_hash:hash,finalized_block:reading.block,balance_atomic:reading.balance,read_at:reading.read_at};
    return this.ctx.storage.transactionSync(()=>{
      const raced=this.released(id);
      if(raced) {if(raced.transaction!==transaction) return unavailable();return raced;}
      // Advance the balance floor in the SAME transaction as releasing the hold.
      // An older in-flight allocation cannot spend the pre-payment balance.
      this.retainBalance(wallet,reading);
      this.ctx.storage.sql.exec("INSERT INTO contribution_releases(id,data) VALUES(?,?)",id,JSON.stringify(result));
      return result;
    });
  }
  /** No chain read, release, private nonce, recipient, signature or request. */
  summary() {
    const meta = this.meta();
    const programs = Object.fromEntries(FIELD_ALLOCATION_PROGRAMS.map(p=>[p,{count:0,amount_atomic:"0"}]));
    let total=0n;
    for (const row of this.holds()) {
      const p=programs[row.program]; if (!p) return unavailable();
      p.count++; p.amount_atomic=String(BigInt(p.amount_atomic)+BigInt(row.amount)); total+=BigInt(row.amount);
    }
    return {started_at:meta?.started_at ?? null, balance_observed_at:meta?.read_at ?? null, finalized_block:meta?.block ?? null, balance_atomic:meta?.balance ?? null, held_atomic:String(total), programs, contribution_commitments:this.ctx.storage.sql.exec<{count:number}>("SELECT COUNT(*) AS count FROM contribution_commitments WHERE id NOT IN (SELECT id FROM contribution_releases)").one().count, released_contributions:this.ctx.storage.sql.exec<{count:number}>("SELECT COUNT(*) AS count FROM contribution_releases").one().count, spendable_atomic:null, limits:FIELD_ALLOCATION_LIMITS};
  }
}
export function allocationLedger(env: Env, wallet: string) {
  if (!env.FIELD_WALLET_ALLOCATIONS || !ADDRESS.test(wallet)) return unavailable();
  return env.FIELD_WALLET_ALLOCATIONS.getByName(`${BASE_EVM.caip2}:${BASE_USDC}:${wallet.toLowerCase()}`);
}
/** Injected test signers stay at their existing seam; every production signer
 * is wrapped before use. A missing binding or RPC failure withholds signatures. */
export function allocatedFieldSigner(env: Env, signer: FieldSigner, program: FieldAllocationProgram, commitmentId?: string): FieldSigner {
  return {address:signer.address, async signTypedData(args) {
    const intent = structuredClone(args);
    try {await allocationLedger(env,signer.address).reserve(signer.address,program,intent,Date.now(),commitmentId);} catch {return unavailable();}
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
