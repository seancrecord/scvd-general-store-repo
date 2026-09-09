import { withKvRetry } from "@/lib/kv-retry";

export type BoundedJson =
  | { status: "readable"; value: unknown; bytes: number }
  | { status: "missing" | "unreadable" | "too_large" | "unavailable" };

/** One record at a time, including legacy bodies that have not moved to R2. */
export async function boundedKvJson(kv: KVNamespace, key: string, maxBytes: number): Promise<BoundedJson> {
  try {
    const stream = await withKvRetry(() => kv.get(key, "stream"));
    if (!stream) return { status: "missing" };
    const reader = stream.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    let bytes = 0;
    let text = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) return { status: "too_large" };
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      try { return { status: "readable", value: JSON.parse(text), bytes }; }
      catch { return { status: "unreadable" }; }
    } finally { await reader.cancel(); }
  } catch { return { status: "unavailable" }; }
}
