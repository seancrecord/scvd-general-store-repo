/**
 * WHICH METHOD THE DOOR TAKES (2026-09-16).
 *
 * WHY THIS FILE EXISTS. Every outbound probe this store makes sent a
 * bare GET and nothing else. An x402 door that takes POST — which the
 * specification permits and which the bazaar extension's own
 * `info.input.method` exists to declare — answered 405, and the
 * battery recorded that 405 as a FAILED `status-402` check: the
 * published defect `no-402`, "listed, but serves no payment
 * challenge", against a door serving a perfectly well-formed
 * challenge one method over.
 *
 * A 405 IS NOT AN OBSERVATION ABOUT THE DOOR. It is the door telling
 * us we asked the wrong question. Rule 52 has forbidden exactly this
 * since 2026-08-25 and its 2026-09-06 amendment says the flattering
 * answer is the one you get: a reader that cannot see something must
 * not answer "no" about it. The 2026-09-04 correction was this defect
 * at the chain layer (our reader could not read XRPL, so it published
 * `not_ready` for 63 hosts). The 2026-09-14 `SPEC_SCHEMES` note was
 * this defect at the scheme layer, and named it exactly right: "a
 * verdict on our reader wearing a finding about their door."
 *
 * This is the same sentence with `method` substituted for `scheme`.
 *
 * WHAT WE LEARNED FROM THE DOOR THAT CAUGHT US. Probed 2026-09-16
 * against the endpoint an operator wrote in about:
 *
 *   GET  -> 405, CONTENT-LENGTH 0, AND NO `Allow` HEADER AT ALL
 *   POST -> 402, x402Version 2, a valid `exact`/eip155:8453 challenge
 *
 * RFC 9110 §15.5.6 makes `Allow` MANDATORY on a 405 and this store
 * enforces that on its own doors (src/index.ts, routes/mcp.ts). Their
 * door does not send it. So a fallback that REQUIRES `Allow` would
 * have failed this door too, and the operator would have got the same
 * wrong verdict from a fix written in his name. `Allow` is read when
 * present and is never a precondition.
 *
 * THE ORDER OF PREFERENCE, cheapest and most-declared first:
 *   1. A method the door or its catalog DECLARED (`declaredMethod`).
 *      No guess and no extra request.
 *   2. `Allow` on the method refusal, when the door sends one.
 *   3. POST, the only other method an x402 door realistically takes.
 *
 * AND THE HONEST FLOOR: when every one of those is exhausted, we have
 * NOT REACHED THE DOOR, and the caller must say so rather than score
 * it. That is what `method_unresolved` is for — see ward-round and
 * preflight. The one answer this file must never produce is a
 * confident "no" about a door nobody knocked on correctly.
 */

/** The methods this store will ever send at a stranger's x402 door. */
export type ProbeMethod = "GET" | "POST";

/**
 * The statuses that mean "wrong method", not "bad door". 405 is the
 * RFC 9110 §15.5.6 method refusal; 501 §15.6.2 is the same refusal
 * from a server that never implemented the method at all. Nothing
 * else belongs here: a 404, a 403 or a 500 is an answer ABOUT the
 * resource, and treating those as "try another verb" would turn one
 * bounded second look into a method sweep against strangers' hosts.
 */
export const METHOD_REFUSAL_STATUSES: ReadonlySet<number> = new Set([405, 501]);

export function isMethodRefusal(status: number): boolean {
  return METHOD_REFUSAL_STATUSES.has(status);
}

/** The body a POST probe sends. Empty JSON: enough to be a POST, never a purchase. */
export const PROBE_POST_BODY = "{}";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readMethod(value: unknown): ProbeMethod | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return upper === "GET" || upper === "POST" ? upper : null;
}

/**
 * Walk the `input.method` shape wherever it hides. The x402 bazaar
 * extension puts it at `info.input.method`; catalogs that flatten the
 * extension put it at `outputSchema.input.method`; some feeds put a
 * bare `method` on the row. All three are the operator's own
 * declaration, so all three are read.
 */
function fromInputBlock(container: unknown): ProbeMethod | null {
  const record = asRecord(container);
  if (!record) return null;
  return (
    readMethod(asRecord(record["input"])?.["method"]) ??
    readMethod(record["method"]) ??
    null
  );
}

/**
 * THE METHOD AN OPERATOR ALREADY TOLD US, from a discovery row, a
 * catalog entry, or a challenge's own `extensions.bazaar` block.
 * Returns null when nothing declared one — which is the common case
 * and is NOT a licence to assume GET; it is the reason the bounded
 * second look below exists.
 *
 * Every path here is a place this store has actually seen a method
 * declared in the wild, not a shape we imagined a feed might use.
 */
export function declaredMethod(row: unknown): ProbeMethod | null {
  const record = asRecord(row);
  if (!record) return null;

  // A bare declaration on the row itself.
  const direct = readMethod(record["method"]) ?? readMethod(record["httpMethod"]);
  if (direct) return direct;

  // The bazaar extension, in a challenge body or a catalog row that
  // carried the challenge verbatim.
  const extensions = asRecord(record["extensions"]);
  const bazaar = asRecord(extensions?.["bazaar"]);
  const fromBazaar = fromInputBlock(asRecord(bazaar?.["info"]));
  if (fromBazaar) return fromBazaar;

  // A catalog that flattened the extension onto the row.
  const fromOutputSchema =
    fromInputBlock(asRecord(record["outputSchema"])) ??
    fromInputBlock(asRecord(record["resourceInfo"])) ??
    fromInputBlock(asRecord(record["info"]));
  if (fromOutputSchema) return fromOutputSchema;

  // Per-offer declarations: the x402 `accepts` array may carry an
  // outputSchema of its own. First declaration wins; a row whose
  // offers disagree about the method is a finding for the operator,
  // not something for this reader to average.
  const accepts = record["accepts"];
  if (Array.isArray(accepts)) {
    for (const entry of accepts) {
      const offer = asRecord(entry);
      if (!offer) continue;
      const method =
        fromInputBlock(asRecord(offer["outputSchema"])) ??
        readMethod(offer["method"]);
      if (method) return method;
    }
  }
  return null;
}

/**
 * The methods a 405's `Allow` header names, uppercased. Empty when
 * the header is absent or names nothing we would send — which the
 * door that prompted this whole change demonstrates is a real and
 * common case, so no caller may treat empty as "no other method
 * exists".
 */
export function allowedMethods(header: string | null): ProbeMethod[] {
  if (!header) return [];
  const methods: ProbeMethod[] = [];
  for (const part of header.split(",")) {
    const method = readMethod(part);
    if (method && !methods.includes(method)) methods.push(method);
  }
  return methods;
}

/**
 * Given a method refusal, what to try next — or null when there is
 * nothing left worth trying. `Allow` wins when it names something we
 * have not sent; otherwise POST, once, when we sent GET.
 *
 * ONE STEP ONLY. This never returns a method already attempted, so a
 * caller looping on it terminates after at most one extra request per
 * probe. That bound is a published promise, not an implementation
 * detail — see the probe-count note in services/preflight.ts.
 */
export function nextMethod(
  allowHeader: string | null,
  attempted: readonly ProbeMethod[],
): ProbeMethod | null {
  for (const method of allowedMethods(allowHeader)) {
    if (!attempted.includes(method)) return method;
  }
  return attempted.includes("POST") ? null : "POST";
}

/**
 * WHAT THE PROBE DID ABOUT THE METHOD, carried beside the response so
 * every downstream reading can say which question the door answered.
 *
 * `unresolved` is the one that changes a verdict: it means every
 * method we were willing to send was refused as a method, so NOTHING
 * was observed about this door's payment challenge. A caller that
 * folds that into `ready` or `not_ready` has published the flattering
 * answer to a question it never asked, which is rule 52 exactly.
 */
export interface ProbeMethodReading {
  /** The method whose response the caller is holding. */
  used: ProbeMethod;
  /** Every method sent, in order. Length > 1 means a fallback ran. */
  attempted: ProbeMethod[];
  /** Where `used` came from, for the readout and the signed row. */
  source: "declared" | "allow-header" | "fallback" | "default";
  /** True when every attempted method was refused AS a method. */
  unresolved: boolean;
  /** The `Allow` header of the last method refusal seen, verbatim, when there was one. */
  allow?: string;
}

/** The plain-English line a readout prints about the method story. */
export function methodNote(reading: ProbeMethodReading): string {
  if (reading.unresolved) {
    return `This door refused every method we sent (${reading.attempted.join(", ")}) as a method, so nothing was observed about its payment challenge. That is a gap in our probe's reach, not a finding about your endpoint — and it is not scored. ${
      reading.allow
        ? `Your 405 named Allow: ${reading.allow}; we do not send those methods at strangers' doors.`
        : "Your 405 carried no Allow header. RFC 9110 §15.5.6 makes it mandatory, and sending it would let this probe — and every buyer's client — find your door on the first try."
    }`;
  }
  if (reading.attempted.length > 1) {
    return `The first ${reading.attempted[0]} was refused as a method, so this reading is of the ${reading.used} that followed${
      reading.source === "allow-header" ? ", chosen from your Allow header" : ""
    }. Everything below describes the ${reading.used} response.`;
  }
  if (reading.source === "declared") {
    return `Probed with ${reading.used}, the method declared for this resource — no method was guessed.`;
  }
  return `Probed with ${reading.used}.`;
}

/**
 * THE FALLBACK LOOP ITSELF, factored out because there are THREE
 * probes in this codebase that knock on strangers' x402 doors — the
 * preflight battery's `probeOnce`, the census's `probeHost`, and the
 * standing watch's own — and until 2026-09-16 each hard-coded
 * `method: "GET"` separately. The brief that opened this work said
 * one function backed every probing surface; it did not, and the one
 * that published the wrong verdict on an operator's passport page was
 * the census, which imports the battery but not the fetch.
 *
 * So the rule lives here, once, and takes the caller's fetch as a
 * closure — because each probe reads its response differently (the
 * battery bounds the text, the census and the watch capture signed
 * evidence) and none of them should have to give that up to share a
 * verb. Bodies are this function's business only for the responses it
 * DISCARDS: a refused method carries no observation, so its body is
 * cancelled here and never reaches a caller.
 *
 * At most `1 + 1` requests. The bound is structural: `nextMethod`
 * never returns a method already attempted.
 */
export async function probeWithMethod(
  send: (method: ProbeMethod) => Promise<Response>,
  options: { method?: ProbeMethod; fallback?: boolean } = {},
): Promise<{ response: Response; reading: ProbeMethodReading }> {
  const fallback = options.fallback ?? true;
  const attempted: ProbeMethod[] = [];
  let method: ProbeMethod = options.method ?? "GET";
  let source: ProbeMethodReading["source"] = options.method ? "declared" : "default";
  let allow: string | undefined;

  for (;;) {
    attempted.push(method);
    const response = await send(method);
    if (!fallback || !isMethodRefusal(response.status)) {
      return {
        response,
        reading: { used: method, attempted, source, unresolved: false, ...(allow ? { allow } : {}) },
      };
    }
    const header = response.headers.get("Allow");
    if (header) allow = header;
    const next = nextMethod(header, attempted);
    if (!next) {
      return {
        response,
        reading: { used: method, attempted, source, unresolved: true, ...(allow ? { allow } : {}) },
      };
    }
    await response.body?.cancel().catch(() => undefined);
    source = allowedMethods(header).includes(next) ? "allow-header" : "fallback";
    method = next;
  }
}
