import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";

/**
 * THE GET STREAM, 2026-09-02. The OpenAI plugin submission portal's
 * tool scan opens a GET on the MCP endpoint expecting text/event-stream
 * before it will POST anything, and reported the store's spec-permitted
 * 405 as "MCP SSE probe returned 404" — no server, as far as it could
 * tell. The channel now opens on request and carries nothing, because
 * nothing is sent unprompted; the bare GET keeps its 405, which is the
 * useful answer for a person or a curl with no Accept header.
 */
describe("GET /mcp with Accept: text/event-stream", () => {
  it("opens a live event stream whose first frame is a comment", async () => {
    const response = await SELF.fetch(`${BASE}/mcp`, {
      headers: { accept: "text/event-stream" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    const first = new TextDecoder().decode(value);
    // A comment frame: the client learns the pipe is live and gets no event.
    expect(first.startsWith(":")).toBe(true);
    expect(first).not.toContain("data:");
    expect(first).not.toContain("event:");
    await reader.cancel();
  });

  it("still answers a bare GET with the 405 that names the door", async () => {
    const response = await SELF.fetch(`${BASE}/mcp`);
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("answers the browser's mixed Accept with the 405, not a stream", async () => {
    // A browser sends text/html first; an event stream in a tab is a hang.
    const response = await SELF.fetch(`${BASE}/mcp`, {
      headers: { accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
    });
    expect(response.status).toBe(405);
  });
});

describe("/mcp/ with a trailing slash", () => {
  it("308s to the door, so a POSTed initialize arrives as a POST", async () => {
    const response = await SELF.fetch(`${BASE}/mcp/`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`${BASE}/mcp`);
  });

  it("308s a GET the same way", async () => {
    const response = await SELF.fetch(`${BASE}/mcp/`, { redirect: "manual" });
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`${BASE}/mcp`);
  });
});
