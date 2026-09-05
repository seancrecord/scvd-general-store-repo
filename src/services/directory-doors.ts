import { checkProbeTarget } from "@/lib/probe-target";
import {
  WELL_KNOWN_DOOR_CAP,
  fetchBounded,
  type ParsedDoors,
  type WellKnownRead,
} from "@/services/well-known-doors";

/**
 * LANE C (2026-09-05): THE DIRECTORY'S OWN PAGE FOR A HOST.
 *
 * The sweep reads a name-only host's own /.well-known/x402; most hosts
 * do not serve one. But the directory that named the host in the
 * first place — x402.fuchss.app — also serves one page per host
 * listing that host's endpoints with grades, and the paths are in the
 * markup as `<span class="r-path">/v1/whatever</span>`. Read beside
 * the host's own file, that page turns a name the census could only
 * count into a door it can knock on.
 *
 * THE CONSENT LINE HOLDS: a door enters the walk only from a feed or
 * from the host's own file. This is a feed — a directory listing the
 * host's endpoints — and a path it lists is joined to the host it is
 * listed under and nothing else. A path is only ever a path: an
 * absolute URL in that span, on some other host, is counted as
 * foreign and never walked, exactly as the well-known reader does.
 * Nothing here trusts the directory's grades or scores; it takes the
 * address and knocks itself.
 *
 * WHAT THIS IS NOT: the host's word. A row this yields carries
 * source "directory", sits out the listed/gone delta like a revisit,
 * and never enters the door bank, which holds the discovery feed's
 * word only. The directory itself is already on the register as
 * `fuchss`; this reads one more page of it per host, in the sweep's
 * idle firings, once a week.
 */
export const DIRECTORY_PROVIDER_BASE = "https://x402.fuchss.app/provider/";
const DIRECTORY_HOST = "x402.fuchss.app";

/**
 * Pure. The paths the page lists, joined to `host`. The markup is
 * matched on one class name in one span, the way the hub page is
 * matched on one href shape: an anchor-level parse, not a layout
 * scrape, so a restyle does not read as a delisting.
 */
export function parseDirectoryDoors(html: string, host: string, ownHost: string): ParsedDoors {
  const target = host.toLowerCase();
  const seen = new Set<string>();
  let foreign = 0;
  let refused = 0;
  for (const match of html.matchAll(/class="r-path">([^<]*)</g)) {
    const raw = (match[1] ?? "").trim();
    if (raw === "") continue;
    let url: URL;
    try {
      url = raw.startsWith("/") ? new URL(`https://${target}${raw}`) : new URL(raw);
    } catch {
      continue;
    }
    if (url.host.toLowerCase() !== target) {
      foreign += 1;
      continue;
    }
    if (!checkProbeTarget(url, ownHost).ok) {
      refused += 1;
      continue;
    }
    seen.add(url.href);
  }
  const all = [...seen];
  return {
    doors: all.slice(0, WELL_KNOWN_DOOR_CAP),
    foreign,
    refused,
    capped: all.length > WELL_KNOWN_DOOR_CAP,
  };
}

/**
 * Read the directory's page for one host. Same three words as the
 * host's own file: doors, none (no page, or a page naming no path),
 * unreadable (the directory did not answer, answered oddly, or sent
 * us somewhere else).
 */
export async function readDirectoryDoors(host: string, ownHost: string): Promise<WellKnownRead> {
  const target = host.trim().toLowerCase();
  if (target === "" || target === ownHost.toLowerCase()) {
    return { kind: "unreadable", reason: "refused: own host or empty" };
  }
  const fetched = await fetchBounded(`${DIRECTORY_PROVIDER_BASE}${encodeURIComponent(target)}`, "text/html");
  if ("error" in fetched) return { kind: "unreadable", reason: fetched.error };
  if (fetched.status === 404) return { kind: "none", via: "directory" };
  if (fetched.status < 200 || fetched.status >= 300) {
    return { kind: "unreadable", reason: `HTTP ${fetched.status}` };
  }
  if (fetched.final_host !== DIRECTORY_HOST) {
    return { kind: "unreadable", reason: `redirected off the directory to ${fetched.final_host || "an unreadable location"}` };
  }
  const parsed = parseDirectoryDoors(fetched.text, target, ownHost);
  if (parsed.doors.length === 0 && parsed.foreign === 0 && parsed.refused === 0) {
    return { kind: "none", via: "directory" };
  }
  return { kind: "doors", declaring_host: target, ...parsed, via: "directory" };
}
