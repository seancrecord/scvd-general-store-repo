import { describe, expect, it } from "vitest";
import { kvPut, kvPutBytes } from "@/lib/kv-retry";
import type { Env } from "@/types";

describe("exhausted KV writes identify their key", () => {
  it.each(["text", "bytes"])("names the %s write without including its value", async shape => {
    const kv = { put: async () => { throw new Error("KV PUT failed: 429 Too Many Requests"); } } as unknown as Env["COUNTERS"];
    const value = "private-value-must-not-appear";
    const error = await (shape === "text" ? kvPut(kv, "reconcile_cursor", value) : kvPutBytes(kv, "reconcile_cursor", new TextEncoder().encode(value).buffer as ArrayBuffer)).catch(e => e as Error);
    expect(String(error)).toContain("reconcile_cursor");
    expect(String(error)).toContain("429");
    expect(String(error)).not.toContain(value);
  });
});
