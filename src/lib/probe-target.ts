/**
 * WHERE THIS STORE WILL POINT A PROBE — one law, in one file.
 *
 * Three doors take a URL from a stranger and make this Worker fetch
 * it: the free preflight, the paid service_audit, and the two watches.
 * Each had grown its OWN gate — https here, default port there, our
 * own hostname in all three but spelled three ways — and the standing
 * watch had quietly stopped checking the port at all. Three copies of
 * a rule is one rule and two places for it to rot.
 *
 * WHAT WAS ACTUALLY MISSING, and it is the part that matters: none of
 * them refused a private address. `https://127.0.0.1/`,
 * `https://[::1]/`, `https://192.168.1.1/` and `https://169.254.169.254/`
 * — the cloud metadata address — all cleared every gate we had. They
 * are https, they are on the default port, and they are not our
 * hostname.
 *
 * That matters more here than it would in most stores, because the
 * probe REPORTS BACK. A refused connection returns its error text to
 * the caller and a successful one returns the response shape. Anyone
 * who can reach these doors could have used them to read whatever the
 * Worker could reach and have the answer handed to them. The paid
 * doors make it worse, not better: buying a service_audit is a
 * supported, documented way to ask this Worker to fetch a URL.
 *
 * WHAT THIS CANNOT DO, said here rather than discovered later: it
 * cannot stop a PUBLIC hostname whose DNS answer points into private
 * space. A Worker resolves nothing before it fetches, so there is no
 * address to inspect at this layer, and a check that pretended
 * otherwise would be worse than none — it would read as complete.
 * What kills that class is the platform's own egress behaviour, not
 * this function, and this function does not claim the credit.
 *
 * The rule lives in `probeOnce` as well as at each door. The door
 * refusal is the one a caller should ever see, because it can say why
 * and charge nothing; the one inside the fetch is there so no door can
 * grow a longer leash than the others ever again.
 */

export interface ProbeTargetVerdict {
  ok: boolean;
  /** Caller-facing, and safe to print: it names the class, not a map. */
  reason?: string;
}

const OK: ProbeTargetVerdict = { ok: true };

/**
 * Name suffixes that are internal by definition. `.local` is mDNS,
 * `.internal` is the convention every cloud uses for private zones,
 * `.home.arpa` is the reserved home-network zone, and a hostname with
 * NO DOT AT ALL resolves through a search domain — which is to say,
 * inside somebody's network.
 */
const INTERNAL_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".intranet",
  ".lan",
  ".home.arpa",
  ".corp",
];

/** IPv4 ranges that are not the public internet, as [first octet, test]. */
function isPrivateIPv4(octets: number[]): boolean {
  const [a = 0, b = 0] = octets;
  return (
    a === 0 || // 0.0.0.0/8, "this network"
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 carrier NAT
    (a === 169 && b === 254) || // link-local, and the metadata address
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 0) || // 192.0.0.0/24 protocol assignments + TEST-NET-1
    (a === 192 && b === 168) || // private
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51) || // TEST-NET-2
    (a === 203 && b === 0) || // TEST-NET-3
    a >= 224 // multicast, reserved, broadcast
  );
}

/** Dotted-quad only. The URL parser has already normalised every other form. */
function parseIPv4(hostname: string): number[] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    octets.push(value);
  }
  return octets;
}

/**
 * WHATWG `url.hostname` KEEPS THE BRACKETS on an IPv6 literal —
 * "[::1]", not "::1". A test caught this the embarrassing way: every
 * check below silently failed to match, and the private addresses
 * were being refused by the single-label fallback instead, which ALSO
 * meant every PUBLIC IPv6 endpoint was refused. Right answer, wrong
 * reason, and a false refusal on legitimate customers hiding behind
 * it.
 */
function bareHost(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

/**
 * Expand any IPv6 spelling to its eight 16-bit groups.
 *
 * MATCHING ON THE TEXT DOES NOT WORK, which a test proved: WHATWG
 * rewrites `::ffff:127.0.0.1` to `::ffff:7f00:1`, so a regex hunting
 * for a dotted quad finds nothing and waves loopback straight through.
 * The only reliable move is to parse the address and look at the bits.
 */
function expandIPv6(address: string): number[] | null {
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0]!.split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1]!.split(":") : [];
  const groups =
    halves.length === 2
      ? [...head, ...Array<string>(8 - head.length - tail.length).fill("0"), ...tail]
      : head;
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    out.push(Number.parseInt(group, 16));
  }
  return out;
}

/** The v4 address carried in the last 32 bits, as octets. */
function embeddedV4(groups: number[], high: number, low: number): number[] {
  const a = groups[high] ?? 0;
  const b = groups[low] ?? 0;
  return [a >> 8, a & 0xff, b >> 8, b & 0xff];
}

function isPrivateIPv6(hostname: string): boolean {
  if (!hostname.includes(":")) return false;
  const groups = expandIPv6(bareHost(hostname).toLowerCase());
  // Unparseable is refused by the caller's other rules; do not guess.
  if (!groups) return true;
  const [first = 0] = groups;

  if (groups.every((group) => group === 0)) return true; // ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1
  if ((first & 0xfe00) === 0xfc00) return true; // unique-local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((first & 0xff00) === 0xff00) return true; // multicast ff00::/8

  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d.
  if (groups.slice(0, 5).every((group) => group === 0)) {
    if (groups[5] === 0xffff || groups[5] === 0) {
      if (isPrivateIPv4(embeddedV4(groups, 6, 7))) return true;
    }
  }
  // NAT64 64:ff9b::/96.
  if (first === 0x64 && groups[1] === 0xff9b) {
    if (isPrivateIPv4(embeddedV4(groups, 6, 7))) return true;
  }
  // 6to4 2002::/16 carries the v4 address in the next 32 bits.
  if (first === 0x2002 && isPrivateIPv4(embeddedV4(groups, 1, 2))) return true;

  return false;
}

/**
 * The whole law. Pure and synchronous, so every door can run it before
 * charging anybody and the tests can enumerate the classes.
 */
export function checkProbeTarget(url: URL, ownHost: string): ProbeTargetVerdict {
  if (url.protocol !== "https:") {
    return {
      ok: false,
      reason:
        "https only. A payment endpoint on plain http is already failing a check no probe needs to run.",
    };
  }
  if (url.port !== "" && url.port !== "443") {
    return {
      ok: false,
      reason:
        "Default https port only — this probe does not dial custom ports.",
    };
  }
  /*
   * Credentials in a URL are a parser-confusion trick as often as a
   * real login: `https://real.example@127.0.0.1/` reads as one host to
   * a human and another to a fetch. We do not carry them anyway.
   */
  if (url.username !== "" || url.password !== "") {
    return {
      ok: false,
      reason:
        "No credentials in the URL. This probe sends none, and a URL that carries them reads as one host to a person and another to a client.",
    };
  }

  /*
   * A trailing dot is the DNS root written out: `localhost.` and
   * `metadata.google.internal.` resolve exactly where the bare names
   * do, and the URL parser keeps the dot on a NAME while stripping it
   * from an IP literal. Every name rule below is an exact or suffix
   * match, so one dot walked past all of them at once — the metadata
   * hostname included (trial run 2026-09-02, segment 4). Struck here,
   * before any name is compared, and struck on the own-host side too
   * so `scvd.store.` is still us.
   */
  const bare = (name: string): string => name.toLowerCase().replace(/\.+$/, "");
  const hostname = bare(url.hostname);
  if (hostname === "") {
    return { ok: false, reason: "That URL names no host." };
  }
  if (hostname === bare(url.host) && hostname === bare(ownHost)) {
    // Handled by the doors with a fuller explanation; kept here so the
    // backstop is complete rather than nearly complete.
    return {
      ok: false,
      reason:
        "That is this store's own hostname, which a Cloudflare Worker cannot fetch.",
    };
  }

  const octets = parseIPv4(hostname);
  if (octets && isPrivateIPv4(octets)) {
    return {
      ok: false,
      reason:
        "That address is private, loopback, link-local or otherwise not on the public internet. This probe only looks at endpoints a buyer could reach, and an endpoint no buyer can reach is not one we can report on.",
    };
  }
  if (isPrivateIPv6(hostname)) {
    return {
      ok: false,
      reason:
        "That IPv6 address is loopback, unique-local, link-local or an embedded private v4. This probe only looks at endpoints a buyer could reach.",
    };
  }
  /*
   * A NAME with no dot resolves through somebody's search domain. An
   * IPv6 LITERAL also has no dot and is not a name at all — excluding
   * it here is what stopped this rule from refusing the entire public
   * IPv6 internet, which it did until a test said so.
   */
  const isIPv6Literal = hostname.includes(":");
  if (!isIPv6Literal && (hostname === "localhost" || !hostname.includes("."))) {
    return {
      ok: false,
      reason:
        "That hostname resolves inside somebody's network, not on the public internet. Give the name a buyer would use.",
    };
  }
  if (INTERNAL_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return {
      ok: false,
      reason:
        "That hostname is in a reserved internal zone. Give the name a buyer would use.",
    };
  }
  if (hostname.endsWith(".onion")) {
    return {
      ok: false,
      reason:
        "This probe does not reach onion services, and a report claiming it had would be false.",
    };
  }
  return OK;
}

/**
 * Thrown by `probeOnce` when a target clears a door it should not
 * have. Named so a caller can tell REFUSED from UNREACHABLE — writing
 * "unreachable" onto a target we declined to dial would be the
 * instrument reporting its own policy as a fact about somebody's
 * endpoint.
 */
export class ProbeTargetRefused extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ProbeTargetRefused";
  }
}
