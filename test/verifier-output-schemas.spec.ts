import { SELF, env } from "cloudflare:test";
import { Ajv2020 } from "ajv/dist/2020";
import { beforeEach, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { DEFECT_CLASSES } from "@/store/defect-vocabulary";
import type { Env } from "@/types";

const base = "https://scvd.store";
const testEnv = env as unknown as Env;
const ajv = new Ajv2020({ strict: false, allErrors: true });

async function rpc(method: string, params: Record<string, unknown> = {}) {
  const response = await SELF.fetch(`${base}/mcp/verifier`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return await response.json() as {
    result: { tools: { name: string; outputSchema?: object }[]; structuredContent: Record<string, unknown> };
    error?: { code: number };
  };
}

async function validator(name: string) {
  const { result } = await rpc("tools/list");
  const schema = result.tools.find(tool => tool.name === name)?.outputSchema;
  expect(schema, `${name} must publish its result contract`).toBeDefined();
  return ajv.compile(schema!);
}

beforeEach(async () => {
  const rows = await testEnv.COUNTERS.list({ prefix: KV_KEYS.corpusPrefix });
  for (const row of rows.keys) await testEnv.COUNTERS.delete(row.name);
});

it("publishes a schema for every verifier tool", async () => {
  const { result } = await rpc("tools/list");
  for (const tool of result.tools) expect(tool.outputSchema, tool.name).toMatchObject({ type: "object" });
});

it("validates readiness for an unknown host and a refused input, and rejects malformed results", async () => {
  const validate = await validator("lookup_endpoint_readiness");
  for (const args of [{ host: "schema-unseen.example" }, {}]) {
    const { result } = await rpc("tools/call", { name: "lookup_endpoint_readiness", arguments: args });
    const data = result.structuredContent;
    expect(validate(data), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...data, observed_at: 42 })).toBe(false);
    const incomplete = { ...data };
    delete incomplete["does_not_establish"];
    expect(validate(incomplete)).toBe(false);
    if (args.host) {
      expect(data["result"]).toBe("never_met");
      expect(validate({ ...data, evidence: { ...(data["evidence"] as object), rounds_probed: "many" } })).toBe(false);
    } else expect(data["result"]).toBe("refused: host_missing");
  }
});

it("validates the stored readiness shape with a last probed round", async () => {
  const host = "schema-observed.example";
  const takenAt = "2026-09-01T17:00:00.000Z";
  await testEnv.COUNTERS.put(`${KV_KEYS.corpusPrefix}000000001`, JSON.stringify({
    snapshot: {
      version: 1, sequence: 1, taken_at: takenAt, previous_digest: null,
      source: "ward_round", week: "2026-W36",
      round: { week: "2026-W36", at: takenAt, listed_resources: 1,
        coverage_suspect: false, capped: false, our_search_presence: true,
        hosts: [{ host, url: `https://${host}/pay`, verdict: "ready", failed: [], advisories: [] }],
      },
    },
    digest: "0".repeat(64), signature: "0".repeat(128), public_key: "0".repeat(64),
  }));
  const validate = await validator("lookup_endpoint_readiness");
  const { result } = await rpc("tools/call", { name: "lookup_endpoint_readiness", arguments: { host } });
  expect(result.structuredContent["result"]).toBe("last_signed_round: ready");
  expect((result.structuredContent["evidence"] as Record<string, unknown>)["last_probed_round"]).not.toBeNull();
  expect(validate(result.structuredContent), JSON.stringify(validate.errors)).toBe(true);
});

it("validates the defect index and every registered definition, including optional provenance", async () => {
  const validate = await validator("get_defect_definition");
  for (const args of [{}, ...DEFECT_CLASSES.map(cls => ({ id: cls.id }))]) {
    const { result } = await rpc("tools/call", { name: "get_defect_definition", arguments: args });
    expect(validate(result.structuredContent), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...result.structuredContent, vocabulary_version: 42 })).toBe(false);
    const incomplete = { ...result.structuredContent };
    delete incomplete["definition_url"];
    expect(validate(incomplete)).toBe(false);
  }
  const unknown = await rpc("tools/call", { name: "get_defect_definition", arguments: { id: "no-such-class" } });
  expect(unknown.error?.code).toBe(-32602);
});
