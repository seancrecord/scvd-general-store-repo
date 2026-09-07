import { describe, expect, it, vi } from "vitest";
import { authorize, boundedText, exchange, readCard, runRuntime, target, A2A_READ_LIMIT, A2A_TIMEOUT_MS } from "@/lib/a2a-instrument";
import { AGENT, CARD_URL, card, task, authorization, fixture } from "./helpers/a2a-fixture";

async function audit(f = fixture()) { const reading = await readCard(CARD_URL, f.fetchImpl); return runRuntime(reading, await authorize(reading, f.fetchImpl), f.fetchImpl); }

describe("the A2A instrument measures its own reach", () => {
  it("accepts the official-schema fixture and exercises retrieval, cancellation and malformed parts", async () => {
    const f = fixture(); const report = await audit(f);
    expect(report.counts.fail).toBe(0); expect(report.counts.not_observed).toBe(0);
    expect(report.checks.filter(c => c.state === "pass")).toHaveLength(report.checks.length);
    expect(f.calls.filter(c => c.init?.method === "POST")).toHaveLength(7);
    expect(f.calls.every(c => c.init?.redirect === "manual")).toBe(true);
  });
  it("catches our historical missing-context defect even if the task otherwise works", async () => {
    const { contextId: _, ...missingContext } = task;
    const report = await audit(fixture({ task: missingContext }));
    expect(report.checks.find(c => c.id === "send-schema")?.state).toBe("fail");
    expect(report.checks.find(c => c.id === "task-get")?.state).toBe("fail");
  });
  it("catches the null-part crash and invalid trailing part separately", async () => {
    const report = await audit(fixture({ broken: ["null-part", "trailing-part"] }));
    expect(report.checks.filter(c => c.state === "fail").map(c => c.id)).toEqual(["null-part", "trailing-part"]);
  });
  it("rejects a mismatched response id even with the expected error number", async () => {
    const report = await audit(fixture({ response: id => id === "null-part" ? Response.json({ jsonrpc: "2.0", id: "wrong", error: { code: -32602, message: "wrong id" } }) : undefined }));
    expect(report.checks.find(c => c.id === "null-part")?.state).toBe("fail");
  });
  it("does not label a legitimate Message as a broken task lifecycle", async () => {
    const report = await audit(fixture({ task: { kind: "message", messageId: "m", role: "agent", parts: [{ kind: "text", text: "hello" }] } }));
    expect(report.counts.fail).toBe(0); expect(report.counts.not_applicable).toBe(2);
  });
  it("does not cancel a running task or infer terminal cancellation", async () => {
    const f = fixture({ task: { ...task, status: { state: "working" } } }); const report = await audit(f);
    expect(report.checks.find(c => c.id === "terminal-cancel")?.state).toBe("not_observed");
    expect(f.calls.some(c => String(c.init?.body).includes('"tasks/cancel"'))).toBe(false);
  });
  it("treats transport failure as an observation gap", async () => {
    const f: typeof fetch = async () => { throw new Error("private internals must not escape"); };
    const report = await readCard(CARD_URL, f);
    expect(report.counts.pass).toBe(0); expect(report.counts.fail).toBe(0);
    expect(JSON.stringify(report)).not.toContain("private internals");
  });
  it("does not evaluate another protocol version under 0.3 rules", async () => {
    const f = fixture({ card: { ...card, protocolVersion: "1.0.0" } }); const report = await readCard(CARD_URL, f.fetchImpl);
    expect(report.checks.find(c => c.id === "card-schema")?.state).toBe("not_observed");
    await expect(authorize(report, f.fetchImpl)).rejects.toThrow("unsupported_version");
    expect(f.calls).toHaveLength(1);
  });
  it("does not follow a redirect or claim the unseen card passed", async () => {
    const f: typeof fetch = async () => new Response(null, { status: 302, headers: { Location: "https://127.0.0.1/" } });
    const report = await readCard(CARD_URL, f);
    expect(report.checks.find(c => c.id === "card-http")?.state).toBe("fail");
    expect(report.checks.find(c => c.id === "card-schema")?.state).toBe("not_observed");
  });
  it("cancels an oversized stream and publishes a read gap", async () => {
    let canceled = false;
    const f: typeof fetch = async () => new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(A2A_READ_LIMIT + 1)); }, cancel() { canceled = true; } }), { headers: { "Content-Type": "application/json" } });
    const result = await exchange("big", CARD_URL, null, f);
    expect(canceled).toBe(true); expect(result.gap).toBe("body_limit"); expect(result.response).toBeNull();
  });
  it("enforces byte limits, including multibyte content", async () => {
    await expect(boundedText(new Response("éé"), 3)).rejects.toThrow("body_limit");
  });
  it("does not confuse a media type beginning with application/json with application/json", async () => {
    const report = await readCard(CARD_URL, async () => new Response(JSON.stringify(card), { headers: { "Content-Type": "application/json-patch+json" } }));
    expect(report.checks.find(c => c.id === "card-http")?.state).toBe("fail");
  });
});

describe("operator authorization precedes runtime action", () => {
  for (const url of ["https://127.0.0.1/", "https://[::1]/", "https://10.1.2.3/", "http://agent.example/", "https://agent.example:444/", "https://u:p@agent.example/", "https://agent.example/?token=x", "https://agent.example/#x", "https://internal/"]) {
    it(`refuses ${url}`, () => expect(() => target(url)).toThrow());
  }
  for (const [name, changes] of Object.entries({ missing_consent: { allow_scvd_audit: false }, missing_negative_consent: { allow_negative_tests: false }, not_repeatable: { safe_to_repeat: false }, other_card: { card_url: AGENT + "/other" }, other_endpoint: { endpoint: "https://elsewhere.example/a2a" }, expired: { expires_at: "2020-01-01T00:00:00Z" }, malformed_expiry: { expires_at: "no" } })) {
    it(`makes no POST with ${name}`, async () => {
      const f = fixture({ authorization: { ...authorization(), ...changes } });
      await expect(audit(f)).rejects.toThrow("authorization_required");
      expect(f.calls.every(c => c.init?.method === "GET")).toBe(true);
    });
  }
  it("refuses authorization for an endpoint on another origin", async () => {
    const f = fixture({ card: { ...card, url: "https://other.example/a2a" } });
    await expect(audit(f)).rejects.toThrow("endpoint_refused"); expect(f.calls).toHaveLength(1);
  });
  it("refuses continuing an existing task", async () => {
    const auth = authorization(); const f = fixture({ authorization: { ...auth, message: { ...auth.message, taskId: "somebody-elses-task" } } });
    await expect(audit(f)).rejects.toThrow("invalid_fixture"); expect(f.calls.every(c => c.init?.method === "GET")).toBe(true);
  });
});
it("a valid application error leaves execution unobserved instead of inventing a schema repair", async () => {
  const report = await audit(fixture({ response: id => id === "send" ? Response.json({ jsonrpc: "2.0", id, error: { code: -32000, message: "fixture is not supported by this application" } }) : undefined }));
  expect(report.checks.find(c => c.id === "send-schema")?.state).toBe("not_observed");
  expect(report.checks.find(c => c.id === "task-get")?.state).toBe("not_observed");
});
it("stops lifecycle probes when operator authorization expires during message/send", async () => {
  const f = fixture(); const reading = await readCard(CARD_URL, f.fetchImpl);
  const permission = await authorize(reading, f.fetchImpl);
  let now = Date.parse(permission.authorization.expires_at) - 1;
  const fetchImpl: typeof fetch = async (input, init) => {
    const response = await f.fetchImpl(input, init); now += 2; return response;
  };
  const report = await runRuntime(reading, permission, fetchImpl, () => now);
  expect(f.calls.filter(c => c.init?.method === "POST")).toHaveLength(1);
  expect(report.checks.find(c => c.id === "task-get")?.state).toBe("not_observed");
  expect(report.checks.find(c => c.id === "terminal-cancel")?.state).toBe("not_observed");
});
it("a late response cannot change an already returned timeout observation", async () => {
  vi.useFakeTimers();
  try {
    let release!: (response: Response) => void;
    const pending = exchange("slow", CARD_URL, null, () => new Promise(resolve => { release = resolve; }));
    await vi.advanceTimersByTimeAsync(A2A_TIMEOUT_MS + 1);
    const result = await pending; const before = JSON.stringify(result);
    release(Response.json(card)); await vi.advanceTimersByTimeAsync(1);
    expect(result.gap).toBe("timeout"); expect(JSON.stringify(result)).toBe(before);
  } finally { vi.useRealTimers(); }
});
