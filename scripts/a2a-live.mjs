import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Ajv } from "ajv";

const schema = JSON.parse(readFileSync(new URL("../research/a2a-2026-09-06/official-schema-0.3.0.json", import.meta.url)));
const version = schema.definitions.AgentCard.properties.protocolVersion.default;
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
ajv.addSchema(schema, "a2a");
const cardSchema = ajv.compile({ $ref: "a2a#/definitions/AgentCard" });
const taskSchema = ajv.compile({ $ref: "a2a#/definitions/Task" });

/** Own-service smoke check, including the success path the generic CLI misses. */
export async function checkA2a(base = "https://scvd.store", fetcher = fetch) {
  const origin = new URL(base).origin;
  const checks = [];
  const add = (id, pass, detail) => checks.push({ id, status: pass ? "pass" : "fail", ...(detail ? { detail } : {}) });
  const request = async (path, body) => {
    const response = await fetcher(new URL(path, origin), {
      method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { "Accept": "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const reader = response.body?.getReader();
    const chunks = []; let size = 0;
    if (reader) try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2 * 1024 * 1024) { await reader.cancel(); throw new Error("Response exceeded 2 MiB"); }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    return { status: response.status, type: response.headers.get("content-type"), body: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  };
  const rpc = (method, params) => ({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params });
  const message = () => ({ kind: "message", role: "user", messageId: crypto.randomUUID(), parts: [{ kind: "data", data: { task: "get_endpoint_readiness", host: "a2a-compliance.invalid" } }] });
  const startedAt = new Date().toISOString();
  try {
    let canonical;
    for (const path of ["/.well-known/agent-card.json", "/.well-known/a2a.json", "/.well-known/agent.json"]) {
      const r = await request(path);
      add(`card:${path}`, r.status === 200 && r.type?.includes("application/json") && cardSchema(r.body), structuredClone(cardSchema.errors));
      if (!canonical) canonical = r.body;
      else add(`alias:${path}`, JSON.stringify(r.body) === JSON.stringify(canonical));
    }
    add("protocol-version", canonical.protocolVersion === version, `declared ${canonical.protocolVersion}; checked ${version}`);
    // Never follow a card to a third-party agent or execute an arbitrary skill.
    if (canonical.url !== `${origin}/a2a`) throw new Error("Card endpoint is not this origin's /a2a");
    const sentRequest = rpc("message/send", { message: message() });
    const sent = await request("/a2a", sentRequest);
    add("send-envelope", sent.status === 200 && sent.body.jsonrpc === "2.0" && sent.body.id === sentRequest.id && !("error" in sent.body));
    add("successful-task-schema", taskSchema(sent.body.result), structuredClone(taskSchema.errors));
    add("successful-task-state", sent.body.result?.status?.state === "completed");
    if (typeof sent.body.result?.id === "string") {
      const task = sent.body.result;
      for (const method of ["tasks/get", "tasks/cancel"]) {
        const query = rpc(method, { id: task.id });
        const answer = await request("/a2a", query);
        add(method, answer.status === 200 && answer.body.id === query.id && answer.body.jsonrpc === "2.0" && (method === "tasks/get" ? !("error" in answer.body) && JSON.stringify(answer.body.result) === JSON.stringify(task) : answer.body.error?.code === -32002));
      }
    } else add("task-lifecycle", false, "No task ID was returned; retrieval and cancellation could not run");
    const missing = await request("/a2a", rpc("tasks/get", { id: `task_${crypto.randomUUID()}` }));
    add("unknown-task", missing.status === 200 && missing.body.error?.code === -32001);
    for (const parts of [[null], [...message().parts, null]]) {
      const malformed = rpc("message/send", { message: { ...message(), parts } });
      const answer = await request("/a2a", malformed);
      add(parts.length === 1 ? "null-part" : "invalid-trailing-part", answer.status === 200 && answer.body.jsonrpc === "2.0" && answer.body.id === malformed.id && answer.body.error?.code === -32602);
    }
  } catch (error) {
    add("probe-completed", false, error instanceof Error ? error.message : "Probe failed");
  }
  return { target: origin, specVersion: version, startedAt, finishedAt: new Date().toISOString(), checks,
    pass: checks.every((c) => c.status === "pass"),
    gaps: ["Structural schemas only; schema formats are not validated", "One free SCVD readiness task; other skills, auth, streaming and push are not exercised", "Retention expiry is tested locally, not by waiting 24 hours", "Unsigned operational reading; not comprehensive protocol certification"] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const base = args.find((a) => a.startsWith("--url="))?.slice(6) ?? "https://scvd.store";
  const output = args.find((a) => a.startsWith("--out="))?.slice(6);
  const report = await checkA2a(base);
  const text = JSON.stringify(report, null, 2) + "\n";
  if (output) writeFileSync(output, text);
  process.stdout.write(text);
  process.exitCode = report.pass ? 0 : 1;
}
