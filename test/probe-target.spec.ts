import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { checkProbeTarget } from "@/lib/probe-target";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

const BASE = "https://scvd.store";

/**
 * WHERE THIS STORE WILL POINT A PROBE.
 *
 * Three doors take a URL from a stranger and make this Worker fetch
 * it. Each had its own gate, none of them refused a private address,
 * and the probe reports what it saw back to whoever asked — which is
 * a read primitive, not a monitoring feature.
 *
 * These tests are the law itself, enumerated by class, because the
 * failure mode of a blocklist is silence: one missed notation and it
 * passes every test that only checks the notations somebody thought
 * of. So the IPv4 forms, the IPv6 forms, the embedded-v4 forms and
 * the name forms each get their own case.
 */

const OWN = "scvd.store";

function verdict(raw: string): ReturnType<typeof checkProbeTarget> {
  return checkProbeTarget(new URL(raw), OWN);
}

describe("the addresses no buyer could reach", () => {
  it.each([
    ["loopback", "https://127.0.0.1/x"],
    ["loopback, high in the /8", "https://127.255.1.9/x"],
    ["this-network", "https://0.0.0.0/x"],
    ["private 10/8", "https://10.1.2.3/x"],
    ["private 172.16/12", "https://172.20.0.1/x"],
    ["private 192.168/16", "https://192.168.1.1/x"],
    ["carrier NAT 100.64/10", "https://100.100.0.1/x"],
    ["link-local", "https://169.254.1.1/x"],
    ["THE METADATA ADDRESS", "https://169.254.169.254/latest/meta-data/"],
    ["benchmarking 198.18/15", "https://198.19.0.1/x"],
    ["multicast", "https://239.1.1.1/x"],
    ["broadcast", "https://255.255.255.255/x"],
  ])("refuses %s", (_label, url) => {
    expect(verdict(url).ok).toBe(false);
  });

  it("still allows the ordinary public internet, including near-miss neighbours", () => {
    // 172.15 and 172.32 sit either side of the private block; a lazy
    // `a === 172` would swallow real hosts.
    for (const url of [
      "https://example.com/x",
      "https://8.8.8.8/x",
      "https://172.15.0.1/x",
      "https://172.32.0.1/x",
      "https://100.63.0.1/x",
      "https://100.128.0.1/x",
    ]) {
      expect(verdict(url), url).toEqual({ ok: true });
    }
  });
});

describe("the same addresses in other notations", () => {
  it("catches the integer and octal forms, because the URL parser normalises them for us", () => {
    /*
     * 2130706433 IS 127.0.0.1. This is the classic blocklist bypass,
     * and the reason it does not work here is that WHATWG URL
     * canonicalises IPv4 in every base before we ever see it. That is
     * a load-bearing assumption, so it gets a test rather than a
     * comment — if the runtime ever stops doing it, this goes red.
     */
    expect(new URL("https://2130706433/x").hostname).toBe("127.0.0.1");
    expect(verdict("https://2130706433/x").ok).toBe(false);
    expect(verdict("https://0177.0.0.1/x").ok).toBe(false);
    expect(verdict("https://0x7f.0.0.1/x").ok).toBe(false);
  });

  it.each([
    ["IPv6 loopback", "https://[::1]/x"],
    ["IPv6 unspecified", "https://[::]/x"],
    ["unique-local fd00::/8", "https://[fd00::1]/x"],
    ["unique-local fc00::/7", "https://[fc00::1]/x"],
    ["link-local fe80::/10", "https://[fe80::1]/x"],
    ["IPv6 multicast", "https://[ff02::1]/x"],
    ["IPv4-mapped loopback", "https://[::ffff:127.0.0.1]/x"],
  ])("refuses %s", (_label, url) => {
    expect(verdict(url).ok).toBe(false);
  });

  it("sees through the embedded-v4 forms the URL parser rewrites", () => {
    /*
     * THIS IS WHERE TEXT MATCHING DIES. WHATWG rewrites
     * `::ffff:127.0.0.1` to `::ffff:7f00:1`, so a regex hunting for a
     * dotted quad finds nothing and waves loopback through. The first
     * version of this file did exactly that; these cases are why it
     * now parses the address into groups and looks at the bits.
     */
    expect(new URL("https://[::ffff:127.0.0.1]/x").hostname).toBe(
      "[::ffff:7f00:1]",
    );
    for (const url of [
      "https://[::ffff:127.0.0.1]/x", // IPv4-mapped loopback
      "https://[::ffff:10.0.0.1]/x", // IPv4-mapped private
      "https://[::ffff:169.254.169.254]/x", // the metadata address, mapped
      "https://[64:ff9b::127.0.0.1]/x", // NAT64 loopback
      "https://[2002:7f00:1::]/x", // 6to4 loopback
    ]) {
      expect(verdict(url).ok, url).toBe(false);
    }
  });

  it("allows public IPv6, which the first version of this rule blocked outright", () => {
    /*
     * The bug this pins was invisible: `hostname` keeps the brackets,
     * so every IPv6 check silently missed and the private addresses
     * were caught by the single-label fallback instead. Right answers
     * for the wrong reason — and the same fallback refused every
     * legitimate public IPv6 endpoint on the way past.
     */
    expect(verdict("https://[2606:4700:4700::1111]/x")).toEqual({ ok: true });
    expect(verdict("https://[2001:4860:4860::8888]/x")).toEqual({ ok: true });
    // A mapped PUBLIC v4 is public.
    expect(verdict("https://[::ffff:8.8.8.8]/x")).toEqual({ ok: true });
  });
});

describe("the names that resolve inside somebody's network", () => {
  it.each([
    ["localhost", "https://localhost/x"],
    ["a .localhost name", "https://api.localhost/x"],
    ["mDNS .local", "https://printer.local/x"],
    ["the cloud .internal convention", "https://db.internal/x"],
    ["the reserved home zone", "https://router.home.arpa/x"],
    ["a bare single-label name", "https://intranet/x"],
  ])("refuses %s", (_label, url) => {
    expect(verdict(url).ok).toBe(false);
  });

  it("refuses an onion address rather than reporting a probe it never made", () => {
    expect(verdict("https://abcdefgh.onion/x").ok).toBe(false);
  });

  /*
   * TRIAL RUN 2026-09-02, segment 4. A trailing dot is the DNS root
   * written out — the name resolves exactly where the bare one does —
   * and the URL parser keeps it on names while stripping it from IP
   * literals. Every name rule is an exact or suffix match, so one dot
   * walked past all of them: `metadata.google.internal.` reached the
   * probe. The IP forms were never affected and stay in their own
   * cases above.
   */
  it.each([
    ["localhost with the root dot", "https://localhost./x"],
    ["a .localhost name with the root dot", "https://api.localhost./x"],
    ["the GCP metadata host with the root dot", "https://metadata.google.internal./x"],
    ["a .internal name with the root dot", "https://db.internal./x"],
    ["a single-label name with the root dot", "https://intranet./x"],
    ["an onion address with the root dot", "https://abcdefgh.onion./x"],
    ["our own hostname with the root dot", `https://${OWN}./x`],
    ["several trailing dots, which the parser also keeps", "https://localhost.../x"],
  ])("refuses %s", (_label, url) => {
    expect(verdict(url).ok).toBe(false);
  });

  it("still allows a public name written with the root dot", () => {
    expect(verdict("https://example.com./x")).toEqual({ ok: true });
  });
});

describe("the rules that were already there, now in one place", () => {
  it("refuses http, non-default ports, and our own hostname", () => {
    expect(verdict("http://example.com/x").ok).toBe(false);
    expect(verdict("https://example.com:8443/x").ok).toBe(false);
    expect(verdict(`https://${OWN}/x`).ok).toBe(false);
    // The explicit default port is the same target, so it is allowed.
    expect(verdict("https://example.com:443/x")).toEqual({ ok: true });
  });

  it("refuses credentials in the URL, which read as one host and dial another", () => {
    /*
     * `https://real.example@127.0.0.1/` is a userinfo trick: a person
     * skims the first hostname, the client dials the second. Here the
     * private-address rule catches it too, but the credential rule
     * fires first and on its own merits — we send no credentials, so
     * carrying them could only ever mislead.
     */
    const refusal = verdict("https://user:pass@example.com/x");
    expect(refusal.ok).toBe(false);
    expect(refusal.reason).toContain("credentials");
    expect(verdict("https://real.example@127.0.0.1/x").ok).toBe(false);
  });

  it("gives a reason on every refusal, because a bare 400 teaches nobody anything", () => {
    for (const url of [
      "http://example.com/x",
      "https://127.0.0.1/x",
      "https://[::1]/x",
      "https://localhost/x",
      "https://example.com:9999/x",
    ]) {
      const refusal = verdict(url);
      expect(refusal.ok, url).toBe(false);
      expect(refusal.reason, url).toBeTruthy();
      expect(refusal.reason!.length, url).toBeGreaterThan(20);
    }
  });
});

describe("the three doors that take a URL from a stranger", () => {
  /*
   * The law is only worth anything if every door runs it, and running
   * it LATE would be worse than not running it — a refusal after
   * settlement is money taken to be told no.
   *
   * So each paid door is probed with a VALID payment signature
   * attached, and the test asserts both halves: the door answers 400,
   * and the facilitator was never asked to settle. The metadata
   * address is the payload because it cleared all three of these
   * doors before this landed — https, default port, not our hostname.
   */
  const METADATA = "https://169.254.169.254/latest/meta-data/";

  it("the free preflight refuses it", async () => {
    const response = await SELF.fetch(`${BASE}/api/preflight`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: METADATA }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/private|loopback|link-local/i);
  });

  it.each([
    ["service_audit", "/api/buy/service_audit"],
    ["conformance_watch", "/api/buy/conformance_watch"],
    ["standing_watch", "/api/buy/standing_watch"],
  ])("the paid %s door refuses it, and settles nothing", async (_name, path) => {
    const facilitator = installFacilitatorMock();
    facilitator.settleCalls = 0;
    // A legitimate target first, purely to obtain a real challenge.
    const challenge = await SELF.fetch(
      `${BASE}${path}?url=${encodeURIComponent("https://example.com/x402")}`,
    );
    expect(challenge.status).toBe(402);
    const signature = buildPaymentSignature(
      decodePaymentRequired(challenge).accepts[0] as never,
    );

    const refused = await SELF.fetch(
      `${BASE}${path}?url=${encodeURIComponent(METADATA)}`,
      { headers: { "PAYMENT-SIGNATURE": signature } },
    );
    expect(refused.status).toBe(400);
    const body = (await refused.json()) as { error: string };
    expect(body.error).toMatch(/private|loopback|link-local/i);
    expect(body.error).toContain("Nothing charged");
    // The half that matters: the refusal came before the money.
    expect(facilitator.settleCalls).toBe(0);
  });

  it("the standing watch door now refuses a custom port too, which it never did", async () => {
    // This door checked https and our own hostname and stopped there.
    // The other two had always refused non-default ports.
    const facilitator = installFacilitatorMock();
    facilitator.settleCalls = 0;
    const challenge = await SELF.fetch(
      `${BASE}/api/buy/standing_watch?url=${encodeURIComponent("https://example.com/x402")}`,
    );
    const signature = buildPaymentSignature(
      decodePaymentRequired(challenge).accepts[0] as never,
    );
    const refused = await SELF.fetch(
      `${BASE}/api/buy/standing_watch?url=${encodeURIComponent("https://example.com:8443/x")}`,
      { headers: { "PAYMENT-SIGNATURE": signature } },
    );
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toContain(
      "Default https port only",
    );
    expect(facilitator.settleCalls).toBe(0);
  });
});
