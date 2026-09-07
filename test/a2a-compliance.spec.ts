import { SELF } from "cloudflare:test";
import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";
import schema from "../research/a2a-2026-09-06/official-schema-0.3.0.json";
import captured from "../research/a2a-2026-09-06/live-probes.json";
import { A2A_REQUEST_MAX_BYTES } from "@/services/a2a-tasks";

// Independent, versioned protocol schema; never the permissive CLI schema.
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
ajv.addSchema(schema, "a2a");
const taskSchema = ajv.compile({ $ref: "a2a#/definitions/Task" });
const cardSchema = ajv.compile({ $ref: "a2a#/definitions/AgentCard" });
const rpc = (method: string, params: unknown, id: string | number = 0) => ({ jsonrpc: "2.0", id, method, params });
const message = () => ({ kind: "message", role: "user", messageId: crypto.randomUUID(), parts: [{ kind: "data", data: { task: "get_endpoint_readiness", host: "a2a-compliance.invalid" } }] });
async function send(body: unknown) {
  const response = await SELF.fetch("https://scvd.store/a2a", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json() as { jsonrpc?: string; id?: unknown; result?: { id: string; contextId: string; status: { state: string }; metadata?: Record<string, unknown> }; error?: { code: number } };
  return { response, json };
}

describe("A2A 0.3.0 successful-task compliance", () => {
  it("the official validator rejects the captured live defect", () => {
    const liveTask = captured.rows.find((row) => "officialTaskSchema" in row)?.body;
    expect(liveTask && "result" in liveTask && taskSchema(liveTask.result)).toBe(false);
    expect(taskSchema.errors).toEqual(expect.arrayContaining([expect.objectContaining({ params: { missingProperty: "contextId" } })]));
  });

  it("every published card passes the official schema", async () => {
    for (const path of ["/.well-known/a2a.json", "/.well-known/agent-card.json", "/.well-known/agent.json"]) {
      const response = await SELF.fetch(`https://scvd.store${path}`);
      const card = await response.json();
      expect(response.status).toBe(200);
      expect(cardSchema(card), JSON.stringify(cardSchema.errors)).toBe(true);
    }
  });

  it("returns a valid Task without a caller context, then retrieves the exact record", async () => {
    const { json } = await send(rpc("message/send", { message: message() }));
    expect(taskSchema(json.result), JSON.stringify(taskSchema.errors)).toBe(true);
    expect(json.id).toBe(0);
    const read = await send(rpc("tasks/get", { id: json.result!.id }));
    expect(read.json.result).toEqual(json.result);
    expect(read.response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("also returns an officially valid failed Task when the task input is refused", async () => {
    const input = { ...message(), parts: [{ kind: "data", data: { task: "verify_receipt" } }] };
    const { json } = await send(rpc("message/send", { message: input }));
    expect(json.result?.status.state).toBe("failed");
    expect(taskSchema(json.result), JSON.stringify(taskSchema.errors)).toBe(true);
    expect((await send(rpc("tasks/get", { id: json.result!.id }))).json.result).toEqual(json.result);
  });

  it("distinguishes terminal cancellation from an unknown task", async () => {
    const { json } = await send(rpc("message/send", { message: message() }));
    const cancel = await send(rpc("tasks/cancel", { id: json.result!.id }));
    expect(cancel.json.error?.code).toBe(-32002);
    const unknown = await send(rpc("tasks/cancel", { id: `task_${crypto.randomUUID()}` }));
    expect(unknown.json.error?.code).toBe(-32001);
    expect((await send(rpc("tasks/get", { id: json.result!.id }))).json.result).toEqual(json.result);
  });

  it.each([null, 0, [], {}, { kind: "data", data: [] }, { kind: "text", text: null }])("refuses malformed part %j as invalid params", async (part) => {
    const { response, json } = await send(rpc("message/send", { message: { ...message(), parts: [part] } }));
    expect(response.status).toBe(200);
    expect(json.jsonrpc).toBe("2.0");
    expect(json.error?.code).toBe(-32602);
  });

  it("validates the whole message before executing a valid leading part", async () => {
    const input = message();
    const { json } = await send(rpc("message/send", { message: { ...input, parts: [...input.parts, null] } }));
    expect(json.error?.code).toBe(-32602);
  });

  it("refuses missing required message fields and invalid task-query parameters", async () => {
    for (const field of ["kind", "role", "messageId"]) {
      const input: Record<string, unknown> = message();
      delete input[field];
      expect((await send(rpc("message/send", { message: input }))).json.error?.code).toBe(-32602);
    }
    for (const params of [{}, { id: 9 }, { id: "unknown", historyLength: -1 }]) {
      expect((await send(rpc("tasks/get", params))).json.error?.code).toBe(-32602);
    }
  });

  it("does not restart terminal tasks or silently accept push and incompatible output modes", async () => {
    const { json } = await send(rpc("message/send", { message: message() }));
    expect((await send(rpc("message/send", { message: { ...message(), taskId: json.result!.id } }))).json.error?.code).toBe(-32004);
    expect((await send(rpc("message/send", { message: { ...message(), taskId: "unknown" } }))).json.error?.code).toBe(-32001);
    for (const [configuration, code] of [
      [{ pushNotificationConfig: { url: "https://example.com/callback" } }, -32003],
      [{ acceptedOutputModes: ["image/png"] }, -32005],
    ] as const) expect((await send(rpc("message/send", { message: message(), configuration }))).json.error?.code).toBe(code);
  });

  it("rejects oversized streamed requests without trusting Content-Length", async () => {
    const raw = JSON.stringify({ ...rpc("message/send", { message: message() }), padding: "x".repeat(A2A_REQUEST_MAX_BYTES) });
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(raw)); controller.close(); } });
    const response = await SELF.fetch("https://scvd.store/a2a", { method: "POST", body: stream });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ jsonrpc: "2.0", error: { code: -32600 } });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it.each([{}, { id: {} }, { id: null }, { id: true }])("rejects invalid RPC IDs without echoing them: %j", async (extra) => {
    const { json } = await send({ jsonrpc: "2.0", method: "message/send", params: { message: message() }, ...extra });
    expect(json.id).toBeNull();
    expect(json.error?.code).toBe(-32600);
  });
});
