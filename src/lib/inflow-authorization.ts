import { AUTHORIZATION_USED_TOPIC, TRANSFER_TOPIC, type EvmChain, type IndexedRpcLog, type UsdcInflowTransfer } from "@/lib/base-rpc";
import { readAuthorizationTransfer } from "@/lib/authorization-receipt";

/** Counts only. Raw event identities never leave the in-memory walk. */
export interface InflowAuthorizationCounts {
  paired_transfers: number;
  paired_amount_atomic: string;
  unpaired_transfers: number;
  unread_transfers: number;
  /** Logical companion queries; transport retries are separate. */
  calls: number;
}
export function emptyAuthorizationCounts(): InflowAuthorizationCounts {
  return { paired_transfers: 0, paired_amount_atomic: "0", unpaired_transfers: 0, unread_transfers: 0, calls: 0 };
}
const hash = (value: unknown): value is string => typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value);
const quantity = (value: unknown): value is string => typeof value === "string" && /^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value);
const addressTopic = (value: unknown): value is string => typeof value === "string" && /^0x0{24}[0-9a-f]{40}$/i.test(value);
function indexed(log: IndexedRpcLog, chain: EvmChain, from: number, to: number): boolean {
  return !!log && typeof log.address === "string" && log.address.toLowerCase() === chain.usdc.toLowerCase() &&
    hash(log.transactionHash) && hash(log.blockHash) && quantity(log.blockNumber) && quantity(log.logIndex) &&
    BigInt(log.blockNumber) >= BigInt(from) && BigInt(log.blockNumber) <= BigInt(to) && log.removed === false;
}
function identity(log: IndexedRpcLog): string {
  return `${log.blockHash!.toLowerCase()}:${log.transactionHash!.toLowerCase()}:${BigInt(log.logIndex!)}`;
}

/**
 * A filtered log query is not a receipt. Global log indices establish the
 * immediate adjacency before reusing the receipt reader's canonical-USDC
 * pair interpretation. Nonremoved mined logs establish execution, not finality.
 * A pair proves a mechanism, never x402 use, agent activity or a sale.
 */
export async function classifyInflowAuthorizations(
  transfers: UsdcInflowTransfer[], chain: EvmChain, from: number, to: number,
  read: (senders: string[]) => Promise<IndexedRpcLog[] | null>,
): Promise<InflowAuthorizationCounts> {
  const result = emptyAuthorizationCounts();
  const valid = transfers.filter(({ log }) => indexed(log, chain, from, to) && Array.isArray(log.topics) &&
    log.topics.length === 3 && log.topics[0]?.toLowerCase() === TRANSFER_TOPIC &&
    addressTopic(log.topics[1]) && addressTopic(log.topics[2]) && hash(log.data));
  result.unread_transfers = transfers.length - valid.length;
  if (!valid.length) return result;
  const senders = [...new Set(valid.map(({ log }) => `0x${log.topics[1]!.slice(-40).toLowerCase()}`))];
  const senderSet = new Set(senders);
  const logs = await read(senders);
  const badRead = !logs || logs.some(log => !indexed(log, chain, from, to) || !Array.isArray(log.topics) ||
    log.topics.length !== 3 || log.topics[0]?.toLowerCase() !== AUTHORIZATION_USED_TOPIC ||
    !addressTopic(log.topics[1]) || !hash(log.topics[2]) || log.data !== "0x" ||
    !senderSet.has(`0x${log.topics[1].slice(-40).toLowerCase()}`));
  if (badRead || new Set(logs!.map(identity)).size !== logs!.length ||
    new Set(valid.map(({ log }) => identity(log))).size !== valid.length) {
    result.unread_transfers += valid.length;
    return result;
  }
  const positions = new Map(logs!.map(log => [identity(log), log]));
  const transactionBlocks = new Map<string, Set<string>>();
  for (const auth of logs!) {
    const tx = auth.transactionHash!.toLowerCase();
    const blocks = transactionBlocks.get(tx) ?? new Set<string>();
    blocks.add(`${auth.blockHash!.toLowerCase()}:${BigInt(auth.blockNumber!)}`);
    transactionBlocks.set(tx, blocks);
  }
  let amount = 0n;
  for (const { log } of valid) {
    const blocks = transactionBlocks.get(log.transactionHash!.toLowerCase());
    const inconsistent = blocks && (blocks.size !== 1 || !blocks.has(`${log.blockHash!.toLowerCase()}:${BigInt(log.blockNumber!)}`));
    if (inconsistent) { result.unread_transfers++; continue; }
    const previous = BigInt(log.logIndex!) - 1n;
    const auth = positions.get(`${log.blockHash!.toLowerCase()}:${log.transactionHash!.toLowerCase()}:${previous}`);
    if (!auth) { result.unpaired_transfers++; continue; }
    const pair = readAuthorizationTransfer({ status: "0x1", blockNumber: log.blockNumber!, logs: [auth, log] },
      { nonce: auth.topics[2]!, payer: `0x${log.topics[1]!.slice(-40)}` }, chain);
    if (pair.status === "matched" && pair.observed) {
      result.paired_transfers++;
      amount += BigInt(pair.observed.amount_atomic);
    } else result.unpaired_transfers++;
  }
  result.paired_amount_atomic = amount.toString();
  return result;
}

/** The same scope and unknown bucket travel with both HTML readers. */
export function inflowAuthorizationText(counts?: InflowAuthorizationCounts): string {
  if (!counts) return "Authorization pairing was not measured in this reading.";
  const amount = BigInt(counts.paired_amount_atomic);
  const usdc = `${amount / 1_000_000n}.${(amount % 1_000_000n).toString().padStart(6, "0")}`;
  return `Authorization pairing: ${counts.paired_transfers} transfers (${usdc} USDC); ${counts.unpaired_transfers} with no pair established; ${counts.unread_transfers} unread. ${counts.calls} companion queries. This identifies an EIP-3009 mechanism, not an x402 purchase or an agent.`;
}
