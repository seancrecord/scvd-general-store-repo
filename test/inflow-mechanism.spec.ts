import { env } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { AUTHORIZATION_USED_TOPIC, TRANSFER_TOPIC, BASE_EVM } from "@/lib/base-rpc";
import { KV_KEYS } from "@/lib/kv-keys";
import { readInflowCensus } from "@/services/inflow-census";
import type { Env } from "@/types";

const payer = `0x${"1".repeat(40)}`, recipient = `0x${"2".repeat(40)}`;
const topic = (address: string) => `0x${address.slice(2).padStart(64, "0")}`;
const transactionHash = `0x${"a".repeat(64)}`, blockHash = `0x${"b".repeat(64)}`;
const logBase = { address: BASE_EVM.usdc, transactionHash, blockHash, blockNumber: "0x64", removed: false };
const transfer = { ...logBase, logIndex: "0x8", topics: [TRANSFER_TOPIC, topic(payer), topic(recipient)], data: `0x${(1234567).toString(16).padStart(64,"0")}` };
const authorization = { ...logBase, logIndex: "0x7", topics: [AUTHORIZATION_USED_TOPIC, topic(payer), `0x${"c".repeat(64)}`], data: "0x" };
const now = new Date("2026-10-02T12:00:00Z");
const bindings = env as unknown as Env;

afterEach(async () => { vi.unstubAllGlobals(); vi.useRealTimers(); await bindings.COUNTERS.delete(KV_KEYS.wardRoundLatest); });
async function read(auths: unknown[] | null, transfers: unknown[] = [transfer]) {
  vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(now);
  await bindings.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify({ week:"2026-W40", at:now.toISOString(),hosts:[{host:"private-door.example",offer:{pay_to:[recipient],networks:[BASE_EVM.caip2],schemes:["exact"]}}]}));
  vi.stubGlobal("fetch",vi.fn(async (_url, init) => {
    const request=JSON.parse(init.body);
    if(request.method==="eth_blockNumber")return Response.json({result:"0x64"});
    const filter=request.params[0];
    if(filter.address.toLowerCase()!==BASE_EVM.usdc.toLowerCase())return Response.json({result:[]});
    if(filter.topics[0]===AUTHORIZATION_USED_TOPIC) {
      if(auths===null) return Response.json({error:{code:-32000,message:"unavailable"}});
      return Response.json({result:auths});
    }
    return Response.json({result:transfers});
  }));
  return (await readInflowCensus(bindings,now))!;
}
it("counts the adjacent canonical pair and its exact USDC amount without publishing identities",async()=>{
 const reading=await read([authorization]);
 expect(reading.windows[0]).toMatchObject({transfers:1,authorization:{paired_transfers:1,paired_amount_atomic:"1234567",unpaired_transfers:0,unread_transfers:0,calls:1}});
 const output=JSON.stringify(reading);for(const privateValue of [payer,recipient,transactionHash,blockHash,"private-door.example"])expect(output).not.toContain(privateValue);
});
it.each([
 { ...authorization, logIndex:"0x6" },
 { ...authorization, topics:[AUTHORIZATION_USED_TOPIC,topic(recipient),authorization.topics[2]] },
 { ...authorization, transactionHash:`0x${"d".repeat(64)}` },
 { ...authorization, blockHash:`0x${"e".repeat(64)}` },
])("does not pair a different sender, transaction, fork or nonadjacent event",async altered=>{
 const reading=await read([altered]);expect(reading.windows[0]).toMatchObject({authorization:{paired_transfers:0,paired_amount_atomic:"0"}});
});
it("keeps failed authorization reads unknown while retaining the transfer",async()=>{
 const reading=await read(null);expect(reading.windows[0]).toMatchObject({transfers:1,authorization:{paired_transfers:0,unpaired_transfers:0,unread_transfers:1}});
});
it("a complete empty authorization read establishes no pair, not a plain-transfer claim",async()=>{
 const reading=await read([]);expect(reading.windows[0]).toMatchObject({authorization:{unpaired_transfers:1,unread_transfers:0}});
});
it("missing transfer positions cannot become a negative finding",async()=>{
 const reading=await read([], [{...transfer,logIndex:undefined}]);expect(reading.windows[0]).toMatchObject({authorization:{unpaired_transfers:0,unread_transfers:1,calls:0}});
});
it("duplicate authorization events cannot inflate a paired total",async()=>{
 const reading=await read([authorization,authorization]);expect(reading.windows[0]).toMatchObject({authorization:{paired_transfers:0,unread_transfers:1}});
});
it.each([
 {...authorization, removed:true},
 {...authorization, data:"0x01"},
 {...authorization, topics:[AUTHORIZATION_USED_TOPIC,topic(payer),"0x00"]},
 {...authorization, blockNumber:"0xffff"},
])("malformed or removed authorization logs stay unread",async altered=>{
 const reading=await read([altered]);expect(reading.windows[0]).toMatchObject({authorization:{paired_transfers:0,unpaired_transfers:0,unread_transfers:1}});
});
it("treats a suspected provider cap as unread",async()=>{
 const reading=await read(Array.from({length:1000},()=>authorization));expect(reading.windows[0]).toMatchObject({authorization:{paired_transfers:0,unpaired_transfers:0,unread_transfers:1}});
});
it("adds exact atomic amounts across adjacent pairs without cross-pairing batch events",async()=>{
 const huge=9007199254740993n;
 const second={...transfer,logIndex:"0xa",data:`0x${huge.toString(16).padStart(64,"0")}`};
 const secondAuth={...authorization,logIndex:"0x9",topics:[AUTHORIZATION_USED_TOPIC,topic(payer),`0x${"d".repeat(64)}`]};
 const reading=await read([authorization,secondAuth],[transfer,second]);
 expect(reading.windows[0]).toMatchObject({authorization:{paired_transfers:2,paired_amount_atomic:(huge+1234567n).toString(),unread_transfers:0}});
});
it("keeps a missing historical measurement distinct from measured zero",async()=>{
 const {inflowAuthorizationText,emptyAuthorizationCounts}=await import("@/lib/inflow-authorization");
 expect(inflowAuthorizationText()).toContain("not measured");
 expect(inflowAuthorizationText(emptyAuthorizationCounts())).toContain("0 transfers (0.000000 USDC)");
 expect(inflowAuthorizationText(emptyAuthorizationCounts())).toContain("not an x402 purchase");
});
