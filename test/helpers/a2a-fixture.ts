import { A2A_AUTH_PATH, record } from "@/lib/a2a-instrument";
export const AGENT = "https://agent.example";
export const CARD_URL = AGENT + "/.well-known/agent-card.json";
export const card = { protocolVersion: "0.3.0", name: "Fixture", description: "Public test agent", url: AGENT + "/a2a", preferredTransport: "JSONRPC", version: "1.0.0", capabilities: { streaming: false, pushNotifications: false }, defaultInputModes: ["text/plain"], defaultOutputModes: ["text/plain"], skills: [{ id: "echo", name: "Echo", description: "Echo a safe test", tags: ["test"] }] };
export const task = { kind: "task", id: "task-1", contextId: "ctx-1", status: { state: "completed" }, artifacts: [{ artifactId: "art-1", parts: [{ kind: "text", text: "safe" }] }] };
export function authorization(now = Date.now()) { return { allow_scvd_audit: true, allow_negative_tests: true, safe_to_repeat: true, card_url: CARD_URL, endpoint: AGENT + "/a2a", expires_at: new Date(now + 86400000).toISOString(), message: { kind: "message", role: "user", messageId: "test", parts: [{ kind: "text", text: "safe echo" }] } }; }
export function fixture(options: { card?: unknown; authorization?: unknown; task?: unknown; broken?: string[]; response?: (id: string) => Response | undefined } = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input); calls.push({ url, init });
    if (url === CARD_URL) return Response.json(options.card ?? card);
    if (url === AGENT + A2A_AUTH_PATH) return Response.json(options.authorization ?? authorization());
    let body: unknown;
    try { body = JSON.parse(String(init?.body)); } catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); }
    const id = record(body) ? String(body.id) : "";
    const custom = options.response?.(id); if (custom) return custom;
    if (options.broken?.includes(id)) return new Response("server error", { status: 500 });
    if (id === "send" || id === "get") return Response.json({ jsonrpc: "2.0", id, result: options.task ?? task });
    const code = id === "cancel" ? -32002 : id === "unknown-task" ? -32001 : -32602;
    return Response.json({ jsonrpc: "2.0", id, error: { code, message: "fixture error" } });
  };
  return { fetchImpl, calls };
}
