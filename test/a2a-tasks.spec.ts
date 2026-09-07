import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { handleA2aRequest } from "@/services/a2a-evidence";
import { A2A_TASK_MAX_BYTES, A2A_TASK_TTL_SECONDS, type EvidenceTaskRecord } from "@/services/a2a-tasks";
import type { Env } from "@/types";

const bindings = env as unknown as Env;
const now = new Date("2030-01-01T00:00:00Z");
function request(data: Record<string, unknown> = { task: "get_endpoint_readiness", host: "expiry-test.invalid" }) {
  return { jsonrpc: "2.0", id: "new-task", method: "message/send", params: { message: { kind: "message", role: "user", messageId: crypto.randomUUID(), contextId: "caller-context", metadata: { inputOnly: "input-only-message-tag" }, parts: [{ kind: "data", data }] } } };
}
async function newTask(data?: Record<string, unknown>) {
  const answer = await handleA2aRequest(bindings, request(data), now);
  expect(answer.body["error"]).toBeUndefined();
  return answer.body["result"] as EvidenceTaskRecord;
}
function lookup(id: string) { return { jsonrpc: "2.0", id: "get", method: "tasks/get", params: { id } }; }

describe("bounded durable A2A results", () => {
  it("retains failed task results as well as completed ones, without the input message", async () => {
    const task = await newTask({ task: "verify_receipt" });
    expect(task.status.state).toBe("failed");
    expect(task.contextId).toBe("caller-context");
    expect(task).not.toHaveProperty("history");
    const read = await handleA2aRequest(bindings, lookup(task.id), now);
    expect(read.body["result"]).toEqual(task);
    expect(JSON.stringify(read)).not.toContain("input-only-message-tag");
  });

  it("expires at the precise boundary even before cleanup, using the supplied clock on both sides", async () => {
    const task = await newTask();
    const expiresAt = now.getTime() + A2A_TASK_TTL_SECONDS * 1000;
    expect(task.metadata.expiresAt).toBe(new Date(expiresAt).toISOString());
    expect((await handleA2aRequest(bindings, lookup(task.id), new Date(expiresAt - 1))).body["result"]).toEqual(task);
    expect((await handleA2aRequest(bindings, lookup(task.id), new Date(expiresAt))).body["error"]).toMatchObject({ code: -32001 });
    const stub = bindings.A2A_TASKS!.getByName(task.id);
    await runInDurableObject(stub, async (instance, state) => {
      expect(await state.storage.getAlarm()).toBe(expiresAt);
      await instance.alarm();
      expect((await state.storage.list()).size).toBe(0);
    });
    expect(await stub.read(now.getTime())).toBeNull();
  });

  it("never replaces a retained result or extends its retention", async () => {
    const task = await newTask();
    const stub = bindings.A2A_TASKS!.getByName(task.id);
    expect(await stub.save({ ...task, contextId: "replacement" })).toBe(false);
    expect(await stub.read(now.getTime())).toEqual(task);
  });

  it("refuses oversized results before writing a row or alarm", async () => {
    const task = await newTask();
    const stub = bindings.A2A_TASKS!.getByName(`size-${crypto.randomUUID()}`);
    expect(await stub.save({ ...task, contextId: "x".repeat(A2A_TASK_MAX_BYTES) })).toBe(false);
    await runInDurableObject(stub, async (_instance, state) => {
      expect((await state.storage.list()).size).toBe(0);
      expect(await state.storage.getAlarm()).toBeNull();
    });
  });

  it("does not announce a Task if storage is absent, throws, or refuses the write", async () => {
    const missing = { ...bindings, A2A_TASKS: undefined };
    expect((await handleA2aRequest(missing, request(), now)).body["error"]).toMatchObject({ code: -32603 });
    for (const failure of [() => Promise.reject(new Error("PRIVATE-FAILURE")), () => Promise.resolve(false)]) {
      // A stub failure at the namespace boundary, not a second storage implementation.
      const spy = vi.spyOn(bindings.A2A_TASKS!, "getByName").mockReturnValue({ save: failure, read: () => Promise.reject(new Error("PRIVATE-FAILURE")) } as unknown as ReturnType<NonNullable<Env["A2A_TASKS"]>["getByName"]>);
      try {
        const write = await handleA2aRequest(bindings, request(), now);
        expect(write.body).not.toHaveProperty("result");
        expect(write.body["error"]).toMatchObject({ code: -32603 });
        const read = await handleA2aRequest(bindings, lookup(`task_${crypto.randomUUID()}`), now);
        expect(read.body["error"]).toMatchObject({ code: -32603 });
        expect(JSON.stringify([write, read])).not.toContain("PRIVATE-FAILURE");
      } finally { spy.mockRestore(); }
    }
  });
});
