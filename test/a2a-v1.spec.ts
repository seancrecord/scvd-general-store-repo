import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientFactory, DefaultAgentCardResolver, JsonRpcTransportFactory } from "@a2a-js/sdk/client";
import { GetTaskRequest, SendMessageRequest, TaskState } from "@a2a-js/sdk";

import receiptValid from "../verifier/fixtures/receipt-valid.json";
import receiptWrongKey from "../verifier/fixtures/receipt-wrong-key.json";
import { a2aRoutes } from "@/routes/a2a";
import { handleA2aV1Request } from "@/services/a2a-v1";
import type { Env } from "@/types";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const BASE = "https://scvd.store";
// `any` is intentional for raw wire assertions: do not lend untrusted replies SDK types.
type Wire = Record<string, any>;
const message = () => ({ messageId: crypto.randomUUID(), role: "ROLE_USER", parts: [{ data: { task: "get_endpoint_readiness", host: "never-met.example" } }] });
async function rpc(method: string, params: unknown, version = "1.0") {
  const response = await SELF.fetch(`${BASE}/a2a`, { method: "POST", headers: { "Content-Type": "application/json", "A2A-Version": version }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return { response, body: await response.json() as Wire };
}

describe("A2A v1 independent client and strict wire", () => {
  it("lets the official client discover, execute, and retrieve a task without a legacy adapter", async () => {
    const fetchImpl: typeof fetch = (input, init) => SELF.fetch(input, init);
    const client = await new ClientFactory({ cardResolver: new DefaultAgentCardResolver({ fetchImpl }), transports: [new JsonRpcTransportFactory({ fetchImpl })] }).createFromUrl(BASE);
    const task = await client.sendMessage(SendMessageRequest.fromJSON({ message: { messageId: "official-client", role: "ROLE_USER", parts: [{ data: { task: "preflight_endpoint", url: "http://localhost/private" } }] } }));
    expect("status" in task).toBe(true);
    if (!("status" in task)) throw new Error("Expected retained task");
    expect(task.status?.state).toBe(TaskState.TASK_STATE_FAILED);
    expect(task.artifacts[0]?.parts[0]?.content?.$case).toBe("data");
    expect(await client.getTask(GetTaskRequest.fromJSON({ id: task.id }))).toEqual(task);
  });

  it("runs a real preflight through the official client against a controlled 402, without paying", async () => {
    // Keep the outbound probe in this isolate so its controlled 402 is injected;
    // discovery and the other client test go through the full SELF worker.
    const fetchImpl: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      return new URL(request.url).pathname === "/a2a" ? a2aRoutes.fetch(request, env) : SELF.fetch(request);
    };
    const client = await new ClientFactory({ cardResolver: new DefaultAgentCardResolver({ fetchImpl }), transports: [new JsonRpcTransportFactory({ fetchImpl })] }).createFromUrl(BASE);
    const url = "https://merchant.example/paid";
    const challenge = { x402Version: 2, resource: { url, description: "Fixture", mimeType: "application/json" }, accepts: [{ scheme: "exact", network: "eip155:8453", amount: "1000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: "0x1111111111111111111111111111111111111111", maxTimeoutSeconds: 60, extra: { name: "USD Coin", version: "2" } }] };
    const probe = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(challenge), { status: 402, headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(challenge)), "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", probe);
    const task = await client.sendMessage(SendMessageRequest.fromJSON({ message: { ...message(), parts: [{ data: { task: "preflight_endpoint", url } }] } }));
    if (!("status" in task)) throw new Error("Expected retained task");
    expect(task.status?.state).toBe(TaskState.TASK_STATE_COMPLETED);
    const content = task.artifacts[0]?.parts[0]?.content;
    expect(content?.$case).toBe("data");
    if (content?.$case !== "data") throw new Error("Expected evidence");
    expect(content.value?.["result"]).toBe("ready");
    expect(content.value?.["does_not_establish"]).toEqual(expect.arrayContaining([expect.stringMatching(/deliver/i)]));
    expect(probe).toHaveBeenCalledTimes(1);
    const headers = new Headers(probe.mock.calls[0]?.[1]?.headers);
    expect(headers.has("PAYMENT-SIGNATURE")).toBe(false);
    expect(await client.getTask(GetTaskRequest.fromJSON({ id: task.id }))).toEqual(task);
  });

  it("preserves positive and negative receipt verification, without upgrading signature validity to settlement", async () => {
    for (const [fixture, verdict] of [[receiptValid, "valid"], [receiptWrongKey, "invalid"]] as const) {
      const { body } = await rpc("SendMessage", { message: { ...message(), parts: [{ data: { task: "verify_receipt", receipt: fixture.receipt, public_key_hex: fixture.publicKeyHex } }] } });
      const data = body.result.task.artifacts[0].parts[0].data;
      expect(data.result).toBe(verdict);
      expect(data.does_not_establish.join(" ")).toContain("settlement");
    }
  });

  it("makes the negotiated card and POST usable from a browser", async () => {
    for (const path of ["/a2a", "/.well-known/agent-card.json"]) {
      const preflight = await SELF.fetch(`${BASE}${path}`, { method: "OPTIONS", headers: { Origin: "https://client.example", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,a2a-version" } });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain("a2a-version");
    }
    const { response } = await rpc("SendMessage", { message: message() });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Expose-Headers")).toMatch(/A2A-Version/i);
  });

  it("never returns a completed result when retention fails, and leaks no storage detail", async () => {
    const broken = { ...env, A2A_TASKS: { getByName: () => { throw new Error("sensitive storage detail"); } } } as unknown as Env;
    const answer = await handleA2aV1Request(broken, { jsonrpc: "2.0", id: 1, method: "SendMessage", params: { message: message() } }, new Date("2030-01-01T00:00:00Z"));
    expect(answer.body["result"]).toBeUndefined();
    expect(answer.body["error"]).toMatchObject({ code: -32603 });
    expect(JSON.stringify(answer)).not.toContain("sensitive storage detail");
  });

  it("negotiates separate cards at every alias and advertises only working A2A bindings", async () => {
    let first: Wire | undefined;
    for (const path of ["agent-card.json", "agent.json", "a2a.json"]) {
      const response = await SELF.fetch(`${BASE}/.well-known/${path}`, { headers: { "A2A-Version": "1.0.99" } });
      expect(response.headers.get("Vary")).toMatch(/A2A-Version/i);
      expect(response.headers.get("A2A-Version")).toBe("1.0");
      const card = await response.json() as Wire;
      expect(card.supportedInterfaces).toEqual([{ url: `${BASE}/a2a`, protocolBinding: "JSONRPC", protocolVersion: "1.0" }, { url: `${BASE}/a2a`, protocolBinding: "JSONRPC", protocolVersion: "0.3" }]);
      expect(card.protocolVersion).toBeUndefined();
      expect(card.url).toBeUndefined();
      expect(card.securityRequirements).toEqual([]);
      if (first) expect(card).toEqual(first);
      first = card;
    }
    const legacy = await (await SELF.fetch(`${BASE}/.well-known/agent-card.json`)).json() as Wire;
    expect(legacy.protocolVersion).toBe("0.3.0");
    expect(legacy.supportedInterfaces).toBeUndefined();
    expect(legacy.additionalInterfaces).toEqual([{ url: `${BASE}/a2a`, transport: "JSONRPC" }]);
  });

  it("returns v1 envelopes, enums and parts and retrieves the same stored evidence through both dialects", async () => {
    const { body } = await rpc("SendMessage", { message: message() });
    expect(body.error).toBeUndefined();
    const task = body.result.task;
    expect(task.kind).toBeUndefined();
    expect(task.status.state).toBe("TASK_STATE_COMPLETED");
    expect(task.artifacts[0].parts[0].kind).toBeUndefined();
    expect(task.artifacts[0].parts[0].data.result).toBe("never_met");
    expect((await rpc("GetTask", { id: task.id, historyLength: 0 })).body.result).toEqual(task);
    const legacy = (await rpc("tasks/get", { id: task.id }, "0.3")).body.result;
    expect(legacy.status.state).toBe("completed");
    expect(legacy.artifacts[0].parts[0].data).toEqual(task.artifacts[0].parts[0].data);
    expect((await rpc("CancelTask", { id: task.id })).body.error.code).toBe(-32002);
    expect((await rpc("GetTask", { id: "unknown" })).body.error.code).toBe(-32001);
    expect((await rpc("SendMessage", { message: { ...message(), taskId: task.id, contextId: "wrong" } })).body.error.code).toBe(-32602);
    expect((await rpc("SendMessage", { message: { ...message(), taskId: task.id } })).body.error.code).toBe(-32004);
  });

  it.each(["2.0", "1.1", "garbage"])("refuses unsupported version %s before executing", async (version) => {
    expect((await rpc("SendMessage", { message: message() }, version)).body.error.code).toBe(-32009);
    expect((await SELF.fetch(`${BASE}/.well-known/agent-card.json`, { headers: { "A2A-Version": version } })).status).toBe(400);
  });

  it.each([
    { message: { ...message(), parts: [{ data: {}, text: "{}" }] } },
    { message: { ...message(), parts: [{ kind: "data", data: {} }] } },
    { message: { ...message(), messageId: "" } },
    { message: { ...message(), role: "user" } },
    { message: message(), configuration: { historyLength: -1 } },
    { message: message(), configuration: { historyLength: 0.5 } },
  ])("rejects malformed v1 params before they reach the evidence engine: %j", async (params) => {
    expect((await rpc("SendMessage", params)).body.error.code).toBe(-32602);
  });

  it("refuses capabilities it does not provide and keeps method dialects separate", async () => {
    for (const [configuration, code] of [[{ returnImmediately: true }, -32004], [{ taskPushNotificationConfig: {} }, -32003], [{ acceptedOutputModes: ["image/png"] }, -32005]] as const) {
      expect((await rpc("SendMessage", { message: message(), configuration })).body.error.code).toBe(code);
    }
    expect((await rpc("message/send", { message: message() })).body.error.code).toBe(-32601);
    expect((await rpc("SendStreamingMessage", {})).body.error.code).toBe(-32004);
    expect((await rpc("CreateTaskPushNotificationConfig", {})).body.error.code).toBe(-32003);
    expect((await rpc("GetExtendedAgentCard", {})).body.error.code).toBe(-32007);
    const badTask = (await rpc("SendMessage", { message: { ...message(), parts: [{ data: { task: "nonexistent" } }] } })).body;
    expect(badTask.error.code).toBe(-32602);
    expect(Array.isArray(badTask.error.data)).toBe(true);
    expect(badTask.error.data[0]["@type"]).toBeTruthy();
  });
});
