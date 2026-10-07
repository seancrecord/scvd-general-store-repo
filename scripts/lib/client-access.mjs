import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";

// These are header probes, not connections from the named crawlers.
export const CLIENT_USER_AGENTS = Object.freeze([
  "node", null, "Googlebot", "GPTBot", "PerplexityBot", "Python-urllib/3.11",
]);

export async function collectClientAccess(url, { timeoutMs = 10_000, maxBytes = 512_000 } = {}) {
  const target = new URL(url);
  if (!["http:", "https:"].includes(target.protocol)) throw new Error("HTTP(S) required");
  const get = target.protocol === "https:" ? httpsGet : httpGet;
  return Promise.all(CLIENT_USER_AGENTS.map((userAgent) => new Promise((resolve) => {
    // fetch inserts its own user-agent when omitted. The HTTP client lets
    // the absent-header control actually omit it. Redirects stay visible.
    const headers = userAgent === null ? {} : { "user-agent": userAgent };
    let timer;
    const finish = (row) => {
      clearTimeout(timer);
      resolve({ userAgent, ...row });
    };
    const request = get(target, { headers }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes) request.destroy(new Error("response exceeds probe byte limit"));
        else chunks.push(chunk);
      });
      response.on("error", (error) => finish({ status: 0, error: error.message }));
      response.on("end", () => finish({
        status: response.statusCode,
        contentType: response.headers["content-type"] ?? "",
        ray: response.headers["cf-ray"] ?? null,
        text: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    request.on("error", (error) => finish({ status: 0, error: error.message }));
    timer = setTimeout(() => request.destroy(new Error("request timed out")), timeoutMs);
  })));
}

export function readClientAccess(rows) {
  const label = (ua) => ua === null ? "no user-agent" : ua;
  const observed = rows ?? [];
  const blocked = observed.filter((row) => !row.error && row.status > 0 && row.status < 500 &&
    (row.status !== 200 || !row.contentType?.startsWith("text/plain") || !row.text?.trim()));
  if (blocked.length) return { verdict: "unmet", note: blocked.map((row) =>
    `${label(row.userAgent)}: ${row.status}${row.status === 200 ? " without the text document" : ""}${row.ray ? ` (Ray ${row.ray})` : ""}`).join("; ") };
  const missing = CLIENT_USER_AGENTS.filter((ua) => {
    const matches = observed.filter((row) => row.userAgent === ua);
    return matches.length !== 1 || matches[0].error || matches[0].status !== 200;
  });
  if (missing.length) return { verdict: "unknown", note: `client probes incomplete: ${missing.map(label).join(", ")}` };
  return { verdict: "met", note: `${CLIENT_USER_AGENTS.length}/${CLIENT_USER_AGENTS.length} header probes received llms.txt; this does not verify crawler identities or other client stacks` };
}
