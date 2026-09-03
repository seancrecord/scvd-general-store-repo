import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import receiptValid from "../verifier/fixtures/receipt-valid.json";
import receiptWrongKey from "../verifier/fixtures/receipt-wrong-key.json";
import { EVIDENCE_TASKS, evidenceAgentCard } from "@/services/a2a-evidence";
import { FREE_DOORS } from "@/store/atlas";

/**
 * THE EVIDENCE AGENT (2026-09-03, roadmap A2). What this file holds:
 *
 *   - the card is in task language: three skills named by their plain
 *     nouns, no house name, the endpoint at /a2a, streaming and push
 *     off, the position carried;
 *   - message/send with a data part runs each task and returns one
 *     completed Task with one artifact in the bounded shape — task,
 *     observed_at, result, scope, does_not_establish, verification_url,
 *     artifact_url, key_url, evidence;
 *   - a receipt verifies against a supplied key and fails against the
 *     wrong one, with the scope saying which;
 *   - a host the chain never met comes back never_met, a fact about
 *     coverage;
 *   - refused input is a JSON-RPC error or a failed task, never a
 *     throw; unknown methods and task state are answered plainly;
 *   - the door is on the atlas and the card at its three paths.
 */

const BASE = "https://scvd.store";

function rpc(data: Record<string, unknown>, id: number | string = 1) {
  return {
    jsonrpc: "2.0",
    id,
    method: "message/send",
    params: { message: { role: "user", messageId: `m-${id}`, parts: [{ kind: "data", data }] } },
  };
}

async function send(body: unknown): Promise<{ status: number; json: Record<string, any> }> {
  const response = await SELF.fetch(`${BASE}/a2a`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, json: (await response.json()) as Record<string, any> };
}

const BOUNDED_KEYS = ["task", "observed_at", "result", "scope", "does_not_establish", "verification_url", "artifact_url", "key_url", "evidence", "never_a_ranking"];

describe("the card", () => {
  it("names three tasks by their plain nouns, points at /a2a, declares streaming and push off, and carries the position", async () => {
    const card = evidenceAgentCard(BASE);
    expect(card["url"]).toBe(`${BASE}/a2a`);
    expect(card["preferredTransport"]).toBe("JSONRPC");
    const skills = card["skills"] as { id: string; name: string }[];
    expect(skills.map((skill) => skill.id)).toEqual([...EVIDENCE_TASKS]);
    expect(skills.map((skill) => skill.name)).toEqual(["x402 endpoint preflight", "x402 receipt verification", "x402 endpoint-readiness dataset"]);
    expect(JSON.stringify(card).toLowerCase()).not.toContain("general store");
    expect((card["capabilities"] as Record<string, boolean>).streaming).toBe(false);
    expect(String(card["description"]).toLowerCase()).toContain("evidence observatory");
    for (const path of ["/.well-known/agent-card.json", "/.well-known/a2a.json", "/.well-known/agent.json"]) {
      const served = (await (await SELF.fetch(`${BASE}${path}`)).json()) as Record<string, unknown>;
      expect(served["url"]).toBe(`${BASE}/a2a`);
    }
    expect(FREE_DOORS.map((door) => door.path)).toContain("/a2a");
  });
});

describe("message/send", () => {
  it("verifies a receipt against the supplied key and returns one completed task with one bounded artifact", async () => {
    const { status, json } = await send(rpc({ task: "verify_receipt", receipt: receiptValid.receipt, public_key_hex: receiptValid.publicKeyHex }));
    expect(status).toBe(200);
    expect(json.id).toBe(1);
    const task = json.result;
    expect(task.kind).toBe("task");
    expect(task.status.state).toBe("completed");
    expect(task.artifacts).toHaveLength(1);
    const data = task.artifacts[0].parts[0].data;
    expect(Object.keys(data).sort()).toEqual([...BOUNDED_KEYS].sort());
    expect(data.task).toBe("verify_receipt");
    expect(data.result).toBe("valid");
    expect(data.scope).toContain("the key supplied with the request");
    expect(data.does_not_establish.join(" ")).toMatch(/settlement/);
    expect(data.verification_url).toBe(`${BASE}/api/conformance/v1`);
    expect(data.key_url).toBe("https://scvd.store/.well-known/did.json");
    expect(data.evidence.verdict).toBe("conforms");
  });

  it("fails the same receipt against the wrong key, and says the signature is what failed", async () => {
    const { json } = await send(rpc({ task: "verify_receipt", receipt: receiptWrongKey.receipt, public_key_hex: receiptWrongKey.publicKeyHex }, 2));
    const data = json.result.artifacts[0].parts[0].data;
    expect(data.result).toBe("invalid");
    expect(json.result.status.state).toBe("completed");
    expect(JSON.stringify(data.evidence.checks)).toMatch(/signature/);
  });

  it("reads readiness for a host the chain never met as never_met, a fact about coverage", async () => {
    const { json } = await send(rpc({ task: "get_endpoint_readiness", host: "never-met.example" }, 3));
    const data = json.result.artifacts[0].parts[0].data;
    expect(data.task).toBe("get_endpoint_readiness");
    expect(data.result).toBe("never_met");
    expect(data.scope).toContain("coverage");
    expect(data.verification_url).toContain("/corpus/host/never-met.example");
    expect(data.artifact_url).toContain("/passport/never-met.example");
  });

  it("refuses a preflight of an unparseable URL as a failed task with the refusal named, never a throw", async () => {
    const { json } = await send(rpc({ task: "preflight_endpoint", url: "not a url" }, 4));
    expect(json.result.status.state).toBe("failed");
    const data = json.result.artifacts[0].parts[0].data;
    expect(data.result).toMatch(/^refused: /);
    expect(data.verification_url).toBe(`${BASE}/api/preflight/v2`);
  });

  it("answers an unknown task, a missing data part, an unknown method and task state with JSON-RPC errors", async () => {
    const unknown = await send(rpc({ task: "trust_this_merchant" }, 5));
    expect(unknown.json.error.code).toBe(-32602);
    expect(unknown.json.error.data.tasks).toEqual([...EVIDENCE_TASKS]);
    const noPart = await send({ jsonrpc: "2.0", id: 6, method: "message/send", params: { message: { role: "user", parts: [{ kind: "text", text: "hello" }] } } });
    expect(noPart.json.error.code).toBe(-32602);
    const method = await send({ jsonrpc: "2.0", id: 7, method: "message/stream", params: {} });
    expect(method.json.error.code).toBe(-32601);
    const state = await send({ jsonrpc: "2.0", id: 8, method: "tasks/get", params: { id: "task_x" } });
    expect(state.json.error.code).toBe(-32001);
    const notRpc = await SELF.fetch(`${BASE}/a2a`, { method: "POST", body: "{" });
    expect(notRpc.status).toBe(400);
  });

  it("accepts the task as JSON in a text part too, and serves its own document on GET", async () => {
    const { json } = await send({ jsonrpc: "2.0", id: 9, method: "message/send", params: { message: { role: "user", parts: [{ kind: "text", text: JSON.stringify({ task: "get_endpoint_readiness", url: "https://never-met-two.example/api/x" }) }] } } });
    expect(json.result.artifacts[0].parts[0].data.result).toBe("never_met");
    const doc = (await (await SELF.fetch(`${BASE}/a2a`)).json()) as Record<string, any>;
    expect(doc.card).toBe(`${BASE}/.well-known/agent-card.json`);
    expect(Object.keys(doc.tasks)).toEqual([...EVIDENCE_TASKS]);
    expect(doc.what_it_cannot_tell_you.join(" ")).toMatch(/trusted/);
  });
});
