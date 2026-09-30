import { env, SELF } from "cloudflare:test";
import { expect, it } from "vitest";
import { developerRoutes } from "@/routes/developers";
import { agentAuthRoutes } from "@/routes/agent-auth";
import { agentsMd } from "@/routes/agents-md";
import { checkoutNetworks } from "@/lib/payment-networks";
import { nativeMcpInstruction } from "@/lib/purchase-capabilities";
import { escapeHtml } from "@/lib/sanitize";
import type { Env } from "@/types";

const bindings = { ...env, MPP_CHECKOUT_ENABLED: "true",
  MPP_CHALLENGE_KEY: "fixture-native-checkout-hmac-key-32bytes" } as unknown as Env;
const base = "https://scvd.store";
it("keeps enabled MCP checkout instructions in the developer HTML, Markdown, JSON and schema", async () => {
  const instruction = nativeMcpInstruction(bindings);
  expect(instruction).not.toBe("");
  for (const accept of ["application/json", "text/markdown", "text/html"]) {
    const response = await developerRoutes.request(`${base}/developers`, { headers: { Accept: accept } }, bindings);
    const text = await response.text();
    expect(text).toContain(accept === "text/html" ? escapeHtml(instruction) : instruction);
    if (accept === "text/html") {
      const blocks = [...text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]!));
      const nodes = blocks.flatMap(block => block["@graph"] ?? [block]) as { url?: string; description?: string }[];
      expect(nodes.find(node => node.url === `${base}/mcp`)?.description).toContain(instruction);
    }
  }
});

it("does not advertise enabled native checkout when it is configured off", async () => {
  const disabled = { ...bindings, MPP_CHECKOUT_ENABLED: "false" };
  for (const config of [bindings, disabled]) {
    const response = await developerRoutes.request(`${base}/developers`, { headers: { Accept: "application/json" } }, config);
    const body = await response.json() as { authentication: string; sections: { heading: string; entries: { label: string; what: string }[] }[] };
    expect(body.authentication).toContain("x402");
    expect(body.authentication.includes("MPP (evm/charge)")).toBe(config === bindings);
    const protocols = body.sections.find(section => section.heading === "Protocols and their scope")!;
    expect(protocols.entries.map(entry => entry.label)).toEqual(expect.arrayContaining(["x402", "MPP", "MCP", "WebMCP", "A2A", "UCP"]));
  }
});

it("makes the existing manual expose native MCP instructions only when available", () => {
  const instruction = nativeMcpInstruction(bindings);
  expect(agentsMd(base, bindings)).toContain(instruction);
  expect(agentsMd(base, { ...bindings, MPP_CHECKOUT_ENABLED: "false" } as Env)).not.toContain(instruction);
  expect(agentsMd(base, bindings)).toContain("observed x402/MPP protocols");
});

it("describes protocol inspection in the developer entry instead of only the legacy verdict", async () => {
  const body = await (await developerRoutes.request(`${base}/developers`, { headers: { Accept: "application/json" } }, bindings)).json() as {
    sections: { entries: { href: string; what: string }[] }[];
  };
  const preflight = body.sections.flatMap(section => section.entries).find(entry => entry.href === `${base}/api/preflight/v1`)!;
  expect(preflight.what).toContain("observed x402/MPP protocols");
  expect(preflight.what).toContain("x402-specific");
});

it("describes negotiation and rate limits without retired site-wide exclusions", async () => {
  const body = await (await developerRoutes.request(`${base}/developers`, { headers: { Accept: "application/json" } }, bindings)).json() as {
    conventions: { q: string; a: string }[];
  };
  expect.soft(body.conventions.find(row => row.q === "Content negotiation")?.a).toContain("recognized agent readers");
  expect(body.conventions.find(row => row.q === "Rate limits")?.a).not.toContain("Nothing else here has an application-level ceiling");
});

it("keeps authentication guidance and metadata aligned with enabled native checkout", async () => {
  for (const config of [bindings, { ...bindings, MPP_CHECKOUT_ENABLED: "false" }]) {
    const native = config.MPP_CHECKOUT_ENABLED === "true";
    const auth = await (await agentAuthRoutes.request(`${base}/auth.md`, {}, config)).text();
    expect.soft(auth.includes("Native MPP checkout:")).toBe(native);
    expect.soft(auth).not.toContain("else here has an application-level ceiling");
    const metadata = await (await agentAuthRoutes.request(`${base}/.well-known/oauth-protected-resource`, {}, config)).json() as {
      agent_auth: { native_mpp?: { mcp: { credential_meta_key: string } }; payment_protocol: { networks: string[] } };
    };
    expect.soft(Boolean(metadata.agent_auth.native_mpp)).toBe(native);
    expect.soft(metadata.agent_auth.payment_protocol.networks).toEqual(checkoutNetworks(config).map(row => row.key));
    if (native) expect.soft(metadata.agent_auth.native_mpp?.mcp.credential_meta_key).toBe("org.paymentauth/credential");
  }
});

it("shows the homepage inspection description in the visible page as well as its schema", async () => {
  const html = await (await SELF.fetch(`${base}/`, { headers: { Accept: "text/html" } })).text();
  const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
  expect(visible).toContain("observed x402/MPP protocols");
});
