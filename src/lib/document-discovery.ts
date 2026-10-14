import type { MiddlewareHandler } from "hono";
import { API_CATALOG_PATH, LINKSET_MEDIA_TYPE } from "@/lib/api-catalog";
import { ROOMS } from "@/store/rooms";
import { escapeHtml } from "@/lib/sanitize";
import type { HonoEnv } from "@/types";

const rooms = new Map(ROOMS.map((room) => [room.path, room]));
const DOCUMENT_TYPE = /^(?:text\/(?:html|markdown|plain|xml)|application\/(?:json|xml|[\w.+-]+\+json))(?:;|$)/i;

/** Only advertise a copy the room actually serves; the test walks every target. */
function roomMachineAlternate(path: string): { path: string; type: string } | undefined {
  const room = rooms.get(path === "/docs" || path === "/api" ? "/developers" : path);
  if (!room) return undefined;
  return room.machineFormat === "json"
    ? { path: room.path, type: "application/json" }
    : { path: `${room.path}.md`, type: "text/markdown" };
}

function hasRelation(header: string, relation: string): boolean {
  return [...header.matchAll(/;\s*rel\s*=\s*(?:"([^"]*)"|([^;,\s]+))/gi)]
    .some((match) => (match[1] ?? match[2] ?? "").split(/\s+/).includes(relation));
}

interface DiscoveryLink {
  href: string;
  rel: string;
  type: string;
}

function linkKey(link: DiscoveryLink): string {
  return `${link.rel}\n${link.href}\n${link.rel === "alternate" ? link.type : ""}`;
}

/**
 * Custom rooms and the shared renderer get the same map. Inspect the head
 * as it streams and append only missing links at its end. Body text,
 * scripts, structured data, canonical links and feeds pass through.
 */
function withDiscoveryHead(response: Response, url: string, links: DiscoveryLink[]): Response {
  const seen = new Set<string>();
  const origin = new URL(url).origin;
  const guideRelations = new Map([
    [`${origin}/openapi.json`, "service-desc"],
    [`${origin}/llms.txt`, "service-doc"],
  ]);
  const rewriter = new HTMLRewriter()
    .on("head link", {
      element(element) {
        const href = element.getAttribute("href");
        if (!href) return;
        let absolute: string;
        try { absolute = new URL(href, url).href; } catch { return; }
        const type = element.getAttribute("type") ?? "";
        const rels = (element.getAttribute("rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
        const kept: string[] = [];
        for (const original of rels) {
          // A contract or store guide is not an alternate copy of this page.
          const rel = original === "alternate" ? guideRelations.get(absolute) ?? original : original;
          const key = linkKey({ href: absolute, rel, type });
          if (["api-catalog", "service-desc", "service-doc"].includes(rel) && seen.has(key)) continue;
          seen.add(key);
          kept.push(rel);
        }
        if (rels.length && !kept.length) element.remove();
        else if (kept.join(" ") !== rels.join(" ")) element.setAttribute("rel", kept.join(" "));
      },
    })
    .on("head", {
      element(element) {
        element.onEndTag((end) => {
          const missing = links.filter((link) => !seen.has(linkKey(link)));
          end.before(missing.map((link) =>
            `\n  <link rel="${escapeHtml(link.rel)}" type="${escapeHtml(link.type)}" href="${escapeHtml(link.href)}">`,
          ).join(""), { html: true });
        });
      },
    });
  // These described the original bytes, before the added metadata.
  response.headers.delete("Content-Length");
  response.headers.delete("ETag");
  return rewriter.transform(response);
}

/**
 * A reader can arrive at any public document, in any representation.
 * Append discovery without replacing canonical, feed or lifecycle links.
 * This runs inside conditionalGet so its 304 keeps the same map, and does
 * not make another request to construct a header. HTML gets the
 * same catalog and alternate through a streaming head-only transform.
 */
export const documentDiscovery: MiddlewareHandler<HonoEnv> = async (c, next) => {
  await next();
  if (c.req.method !== "GET" && c.req.method !== "HEAD") return;
  if (c.req.path.startsWith("/admin") || c.req.path.startsWith("/api/buy/")) return;
  if (c.res.status !== 200 || c.res.headers.has("Set-Cookie")) return;
  const alternate = roomMachineAlternate(c.req.path);
  const cacheControl = c.res.headers.get("Cache-Control") ?? "";
  if (/\bprivate\b/i.test(cacheControl)) return;
  // A registered public room can be fresh on every read (/bot-auth).
  // Other no-store answers may be deliveries, not discovery documents.
  if (/\bno-store\b/i.test(cacheControl) && !alternate) return;
  if (!DOCUMENT_TYPE.test(c.res.headers.get("Content-Type") ?? "")) return;

  const base = c.env.STORE_BASE_URL;
  const existing = c.res.headers.get("Link") ?? "";
  const links = existing ? [existing] : [];
  const catalog: DiscoveryLink = { href: `${base}${API_CATALOG_PATH}`, rel: "api-catalog", type: LINKSET_MEDIA_TYPE };
  const headLinks: DiscoveryLink[] = [
    catalog,
    { href: `${base}/openapi.json`, rel: "service-desc", type: "application/json" },
    { href: `${base}/developers`, rel: "service-doc", type: "text/html" },
    { href: `${base}/llms.txt`, rel: "service-doc", type: "text/plain" },
  ];
  if (!hasRelation(existing, "api-catalog")) {
    links.push(`<${base}${API_CATALOG_PATH}>; rel="api-catalog"; type="${LINKSET_MEDIA_TYPE}"`);
  }
  if (alternate) {
    const query = new URL(c.req.url).search;
    const href = `${base}${alternate.path}${query}`;
    const link = `<${href}>; rel="alternate"; type="${alternate.type}"`;
    if (!existing.includes(link)) links.push(link);
    headLinks.push({ href, rel: "alternate", type: alternate.type });
  }
  c.res.headers.set("Link", links.join(", "));
  if (c.req.method === "GET" && c.res.headers.get("Content-Type")?.toLowerCase().startsWith("text/html")) {
    c.res = withDiscoveryHead(c.res, `${base}${c.req.path}`, headLinks);
  }
};
