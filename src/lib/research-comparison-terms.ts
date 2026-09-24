import { checkProbeTarget } from "@/lib/probe-target";

export const COMPARISON_MIN_URLS = 2;
export const COMPARISON_MAX_URLS = 4;
export const COMPARISON_URL_CAP = 1024;
export const COMPARISON_INPUT_CAP = COMPARISON_MAX_URLS * (COMPARISON_URL_CAP + 4) + 2;
export const COMPARISON_OFFER_CAP = 8;
export const COMPARISON_EXAMPLE_INPUT = JSON.stringify(["https://research-a.example/quote", "https://research-b.example/quote"]);

export const COMPARISON_INPUT_DESCRIPTION =
  `JSON-encoded array of ${COMPARISON_MIN_URLS}–${COMPARISON_MAX_URLS} distinct public HTTPS URLs (${COMPARISON_URL_CAP} characters each), for unauthenticated GET payment challenges. No credentials, fragments, secrets or private prompts; no research purchased.`;

/** One bounded input contract for HTTP, MCP and the instrument itself. */
export function comparisonUrls(raw: unknown, base: string): string[] {
  if (typeof raw !== "string" || raw.length > COMPARISON_INPUT_CAP) {
    throw new Error(COMPARISON_INPUT_DESCRIPTION);
  }
  let values: unknown;
  try { values = JSON.parse(raw); } catch { throw new Error(COMPARISON_INPUT_DESCRIPTION); }
  if (!Array.isArray(values) || values.length < COMPARISON_MIN_URLS || values.length > COMPARISON_MAX_URLS) {
    throw new Error(COMPARISON_INPUT_DESCRIPTION);
  }
  const urls = values.map((value: unknown) => {
    if (typeof value !== "string" || !value.length || value.length > COMPARISON_URL_CAP || /[\u0000-\u0020\u007f]/.test(value)) {
      throw new Error(COMPARISON_INPUT_DESCRIPTION);
    }
    let url: URL;
    try { url = new URL(value); } catch { throw new Error(COMPARISON_INPUT_DESCRIPTION); }
    const target = checkProbeTarget(url, new URL(base).host);
    if (!target.ok || url.hash || value.includes("#")) {
      throw new Error(target.reason ?? "Remove URL fragments before comparing endpoints.");
    }
    // The root dot names the same host. Do not sell two looks at that alias.
    url.hostname = url.hostname.replace(/\.+$/, "");
    return url.href;
  });
  if (new Set(urls).size !== urls.length) throw new Error("Each endpoint must appear once. Duplicate URLs are refused, not silently removed.");
  return urls;
}
