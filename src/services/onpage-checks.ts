/**
 * THE ON-PAGE BATTERY — what one public page serves a machine reader.
 *
 * The store's second check battery beside the preflight, and the same
 * posture: named checks against published criteria, advisories that
 * never fold into the verdict, and the blind spots stated on the
 * artifact rather than discovered by the buyer. The preflight reads a
 * payment door; this reads a PAGE — title, description, canonical,
 * robots directives, headings, structured data, links — the parts a
 * crawler, an agent, or a link preview actually consumes.
 *
 * THE HONEST BOUNDARY, stated first because it is the one buyers will
 * test: this battery reads the HTML AS SERVED. Nothing here executes
 * a script, so a page built client-side can be nearly empty in this
 * reading and rich in a browser — and this battery cannot tell those
 * apart. That is not a defect to paper over; it is the finding. What
 * a machine gets before JavaScript runs is precisely what most
 * machine readers get, and the report names the gap instead of
 * guessing across it.
 *
 * PARSED WITH HTMLRewriter — native to Workers, streaming, zero new
 * dependencies. First use of it in this codebase; the collector
 * pattern (buffer per element, flush on the next open tag and once
 * at the end) is the part worth copying.
 */

/** The battery, versioned like the preflight's. */
export const ONPAGE_VERSION = "v1";

/** Same shape as the preflight's check; declared here so the two
 * batteries can drift apart without a shared type forcing a lie. */
export interface OnpageCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/** Advisory: true and worth knowing, never folded into the verdict. */
export interface OnpageAdvisory {
  name: string;
  detail: string;
}

/** What the parse actually saw, before any judgment is applied. */
export interface PageFacts {
  titles: string[];
  metaDescriptions: string[];
  metaRobots: string[];
  canonicals: string[];
  jsonLdBlocks: string[];
  h1Count: number;
  anchorCount: number;
  /** Anchors whose href is missing, empty, or a bare "#". */
  anchorsWithoutDestination: number;
  htmlLang: string | null;
}

/**
 * One streaming pass over the served bytes. Element text arrives in
 * chunks, so <title> and JSON-LD scripts accumulate into a buffer
 * that flushes when the next element of the same kind opens (they
 * cannot nest) and once more when the stream ends.
 */
export async function readPageFacts(html: string): Promise<PageFacts> {
  const facts: PageFacts = {
    titles: [],
    metaDescriptions: [],
    metaRobots: [],
    canonicals: [],
    jsonLdBlocks: [],
    h1Count: 0,
    anchorCount: 0,
    anchorsWithoutDestination: 0,
    htmlLang: null,
  };
  let title: string | null = null;
  let jsonLd: string | null = null;
  const flushTitle = () => {
    if (title !== null) {
      facts.titles.push(title.trim());
      title = null;
    }
  };
  const flushJsonLd = () => {
    if (jsonLd !== null) {
      facts.jsonLdBlocks.push(jsonLd);
      jsonLd = null;
    }
  };

  const rewriter = new HTMLRewriter()
    .on("html", {
      element(element) {
        facts.htmlLang = element.getAttribute("lang");
      },
    })
    .on("title", {
      element() {
        flushTitle();
        title = "";
      },
      text(chunk) {
        if (title !== null) {
          title += chunk.text;
        }
      },
    })
    .on("meta", {
      element(element) {
        const name = (element.getAttribute("name") ?? "").toLowerCase();
        const content = element.getAttribute("content") ?? "";
        if (name === "description") {
          facts.metaDescriptions.push(content);
        }
        if (name === "robots") {
          facts.metaRobots.push(content);
        }
      },
    })
    .on("link", {
      element(element) {
        const rels = (element.getAttribute("rel") ?? "")
          .toLowerCase()
          .split(/\s+/);
        if (rels.includes("canonical")) {
          facts.canonicals.push(element.getAttribute("href") ?? "");
        }
      },
    })
    .on("script", {
      element(element) {
        // A non-JSON-LD script still flushes the previous buffer;
        // scripts cannot nest, so an open buffer means the last one.
        flushJsonLd();
        const type = (element.getAttribute("type") ?? "").trim().toLowerCase();
        if (type === "application/ld+json") {
          jsonLd = "";
        }
      },
      text(chunk) {
        if (jsonLd !== null) {
          jsonLd += chunk.text;
        }
      },
    })
    .on("h1", {
      element() {
        facts.h1Count += 1;
      },
    })
    .on("a", {
      element(element) {
        facts.anchorCount += 1;
        const href = (element.getAttribute("href") ?? "").trim();
        if (href === "" || href === "#") {
          facts.anchorsWithoutDestination += 1;
        }
      },
    });

  // Consuming the transformed body is what drives the handlers.
  await rewriter.transform(new Response(html)).text();
  flushTitle();
  flushJsonLd();
  return facts;
}

const TITLE_COMFORTABLE = 60;
const DESCRIPTION_COMFORTABLE = 160;

function quoted(text: string): string {
  return text.length > 80 ? `"${text.slice(0, 77)}..."` : `"${text}"`;
}

/**
 * The judgment half, split from the fetch (the preflight's discipline)
 * so tests can aim it at synthetic pages and the paid audit runs
 * EXACTLY what the free desk runs. Checks fail the verdict; advisories
 * never do.
 */
export function runOnpageChecks(
  status: number,
  contentType: string,
  facts: PageFacts,
  bodyOverLimit: boolean,
): { checks: OnpageCheck[]; advisories: OnpageAdvisory[] } {
  const checks: OnpageCheck[] = [];
  const advisories: OnpageAdvisory[] = [];

  if (status >= 300 && status < 400) {
    checks.push({
      name: "serves-html",
      ok: false,
      detail: `answered ${status}: a redirect. This probe does not follow it, and neither do plenty of cheap machine readers — audit the URL the page actually lives at.`,
    });
    return { checks, advisories };
  }
  if (status !== 200) {
    checks.push({
      name: "serves-html",
      ok: false,
      detail: `answered ${status} instead of 200. Whatever a browser might show, a machine reader stops here.`,
    });
    return { checks, advisories };
  }
  const isHtml =
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml+xml");
  if (!isHtml) {
    checks.push({
      name: "serves-html",
      ok: false,
      detail: `answered 200 but Content-Type is "${contentType}" — this battery reads HTML. If the URL is an API endpoint, the x402 preflight at /api/preflight is the right instrument.`,
    });
    return { checks, advisories };
  }
  checks.push({
    name: "serves-html",
    ok: true,
    detail: `answered 200 with ${contentType || "an HTML body"}`,
  });

  const titles = facts.titles.filter((text) => text.length > 0);
  if (facts.titles.length === 0 || titles.length === 0) {
    checks.push({
      name: "title",
      ok: false,
      detail:
        "no non-empty <title>. It is the first line every machine reader takes — search listings, link previews, agents skimming tabs — and this page leaves it to them to invent.",
    });
  } else if (facts.titles.length > 1) {
    checks.push({
      name: "title",
      ok: false,
      detail: `${facts.titles.length} <title> elements. Readers take one and you do not choose which; the page should.`,
    });
  } else {
    checks.push({
      name: "title",
      ok: true,
      detail: `one <title>: ${quoted(titles[0]!)}`,
    });
    if (titles[0]!.length > TITLE_COMFORTABLE) {
      advisories.push({
        name: "title-length",
        detail: `the title runs ${titles[0]!.length} characters; surfaces that show ~${TITLE_COMFORTABLE} will cut it mid-thought. Not a defect — a fact about where it gets quoted.`,
      });
    }
  }

  const descriptions = facts.metaDescriptions.filter(
    (text) => text.trim().length > 0,
  );
  if (descriptions.length === 0) {
    checks.push({
      name: "meta-description",
      ok: false,
      detail:
        'no meta name="description" with content. Machines summarizing this page will write their own summary from whatever they find, and it will not be the sentence you would have chosen.',
    });
  } else if (facts.metaDescriptions.length > 1) {
    checks.push({
      name: "meta-description",
      ok: false,
      detail: `${facts.metaDescriptions.length} meta descriptions. One page, one summary; readers pick one and you do not choose which.`,
    });
  } else {
    checks.push({
      name: "meta-description",
      ok: true,
      detail: `meta description present: ${quoted(descriptions[0]!)}`,
    });
    if (descriptions[0]!.length > DESCRIPTION_COMFORTABLE) {
      advisories.push({
        name: "description-length",
        detail: `the description runs ${descriptions[0]!.length} characters; surfaces that show ~${DESCRIPTION_COMFORTABLE} will truncate it.`,
      });
    }
  }

  if (facts.canonicals.length > 1) {
    checks.push({
      name: "canonical",
      ok: false,
      detail: `${facts.canonicals.length} rel=canonical links. Two claims about which URL is the real one is zero claims; readers resolve the conflict by ignoring both.`,
    });
  } else if (facts.canonicals.length === 1) {
    const href = facts.canonicals[0]!;
    let absolute = false;
    try {
      absolute = new URL(href).protocol.startsWith("http");
    } catch {
      absolute = false;
    }
    checks.push(
      absolute
        ? {
            name: "canonical",
            ok: true,
            detail: `one rel=canonical, absolute: ${quoted(href)}`,
          }
        : {
            name: "canonical",
            ok: false,
            detail: `rel=canonical href ${quoted(href)} is not an absolute http(s) URL. The one link whose whole job is being unambiguous should not need resolving.`,
          },
    );
  } else {
    advisories.push({
      name: "no-canonical",
      detail:
        "no rel=canonical. Optional — but any duplicate of this page (tracking parameters, a www twin, a mirror) competes with it as an equal, because nothing says which is the original.",
    });
  }

  if (facts.jsonLdBlocks.length > 0) {
    const broken = facts.jsonLdBlocks.filter((block) => {
      try {
        JSON.parse(block);
        return false;
      } catch {
        return true;
      }
    }).length;
    checks.push(
      broken === 0
        ? {
            name: "structured-data",
            ok: true,
            detail: `${facts.jsonLdBlocks.length} JSON-LD block${facts.jsonLdBlocks.length === 1 ? "" : "s"}, each parseable JSON. Parsed, not validated against a vocabulary — that is a judgment this battery does not sell.`,
          }
        : {
            name: "structured-data",
            ok: false,
            detail: `${broken} of ${facts.jsonLdBlocks.length} JSON-LD blocks are not parseable JSON — a reader rejects them before learning what they claimed to say.`,
          },
    );
  } else {
    advisories.push({
      name: "no-structured-data",
      detail:
        "no JSON-LD structured data. Machines reading this page get prose only; whatever it is about, they will have to infer it.",
    });
  }

  const robots = facts.metaRobots.join(",").toLowerCase();
  if (/\bnoindex\b|\bnone\b/.test(robots)) {
    advisories.push({
      name: "robots-noindex",
      detail: `meta robots says "${facts.metaRobots.join("; ")}" — the page asks machine readers to leave it out of their indexes. Fine if intended; worth knowing if not, because it is working.`,
    });
  }

  if (facts.h1Count === 0) {
    advisories.push({
      name: "heading-shape",
      detail:
        "no <h1>. Readers that outline a page start from its top heading; this one starts from nothing.",
    });
  } else if (facts.h1Count > 1) {
    advisories.push({
      name: "heading-shape",
      detail: `${facts.h1Count} <h1> elements. Legal HTML — but every outline-reading machine picks its own idea of which one leads.`,
    });
  }

  if (!facts.htmlLang || facts.htmlLang.trim().length === 0) {
    advisories.push({
      name: "no-lang",
      detail:
        "no lang attribute on <html>. Screen readers and language-routing machines guess; the guess is usually right, and 'usually' is the finding.",
    });
  }

  if (facts.anchorsWithoutDestination > 0) {
    advisories.push({
      name: "dead-anchors",
      detail: `${facts.anchorsWithoutDestination} of ${facts.anchorCount} links have no destination (missing, empty, or bare "#" href) — to a link-following reader they are doors painted on the wall. Usually script-driven controls, which is exactly the kind of thing this battery cannot see past.`,
    });
  }

  if (bodyOverLimit) {
    advisories.push({
      name: "large-body",
      detail:
        "the page exceeds this probe's read ceiling; every check above reflects only what was read before the cutoff. Cheap machine readers cut off too, usually earlier.",
    });
  }

  return { checks, advisories };
}
