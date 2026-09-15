/**
 * A STORE DOCUMENT, RENDERED AS MARKDOWN FROM THE JSON IT ALREADY SERVES.
 *
 * WHY THIS EXISTS. Nine landing pages here — /corpus, /doors,
 * /criteria, /conformance, /scorers, /bounties, /rights, /notice,
 * /corrections — each answered exactly two ways: HTML for a browser,
 * JSON for an agent. Ask any of them for `text/markdown` and the
 * negotiation picked JSON, because markdown was not on offer; ask for
 * the `.md` twin and index.ts returned an honest 404, because the
 * twin handler is DERIVED and there was nothing to derive from. An
 * outside scan sampled the suffix and graded the fallback partial.
 *
 * WHY DERIVED RATHER THAN WRITTEN NINE TIMES. The rule the `.md`
 * handler states is that inventing a markdown rendering by stripping
 * tags would publish a document nobody wrote. This does not strip
 * tags. These payloads are not markup and not a database row — they
 * are the store's own authored prose, keyed: `what_this_is`,
 * `what_this_is_not`, `what_money_buys`, `never_a_ranking`. The
 * sentences in the markdown are the sentences someone wrote, in the
 * order they wrote them. What this adds is headings derived from the
 * keys that were already there.
 *
 * And the property that matters more than elegance: a hand-written
 * markdown twin of nine documents is nine documents to keep in step,
 * and the day one of them falls behind is the day the store publishes
 * two answers to one question. Rendering from the served document
 * means the markdown cannot say anything the JSON does not.
 *
 * KEY ORDER IS CONTENT. These documents open with what the thing is
 * and close with how to check it, deliberately. Nothing here sorts,
 * groups or promotes: the walk is insertion order, top to bottom.
 */

/**
 * Tokens that are not words. A key is otherwise humanised by
 * replacing underscores and capitalising the first letter only —
 * sentence case, because these keys ARE sentence fragments and title
 * case would make "What This Is Not" out of a question.
 */
import { MARKDOWN_MEDIA_TYPE, VARY_ACCEPT } from "@/lib/accept";

const ACRONYMS: Readonly<Record<string, string>> = {
  api: "API",
  cli: "CLI",
  csp: "CSP",
  faq: "FAQ",
  html: "HTML",
  http: "HTTP",
  id: "ID",
  json: "JSON",
  jwt: "JWT",
  kv: "KV",
  mcp: "MCP",
  mpp: "MPP",
  pct: "percent",
  prm: "PRM",
  rfc: "RFC",
  sdk: "SDK",
  ttl: "TTL",
  url: "URL",
  urls: "URLs",
  usd: "USD",
  usdc: "USDC",
  utc: "UTC",
  x402: "x402",
};

export function humaniseKey(key: string): string {
  const words = key.split(/[_\s]+/).filter(Boolean);
  if (words.length === 0) return key;
  const mapped = words.map((word) => {
    const lower = word.toLowerCase();
    return Object.prototype.hasOwnProperty.call(ACRONYMS, lower) ? ACRONYMS[lower]! : lower;
  });
  const [first = "", ...rest] = mapped;
  const lead =
    Object.prototype.hasOwnProperty.call(ACRONYMS, (words[0] ?? "").toLowerCase())
      ? first
      : first.charAt(0).toUpperCase() + first.slice(1);
  return [lead, ...rest].join(" ");
}

function isUrl(value: string): boolean {
  return /^https?:\/\/\S+$/.test(value.trim());
}

/**
 * A value short enough to sit on the same line as its label. The
 * threshold is a line of prose, not a magic number: past it the value
 * is a sentence and wants a paragraph, under it it is a figure, a
 * URL, a date or a token and wants to stay beside the thing it names.
 */
const INLINE_MAX = 96;

/**
 * What makes a TABLE cell too long is different, and conflating the
 * two cost /doors its table: 21 of 2,862 host rows carry a URL past
 * the inline ceiling, which rejected the table for all of them. A
 * cell is too long when it is PROSE that will not sit on a row — an
 * unbroken token like a URL cannot be reflowed anywhere and is no
 * worse in a cell than beside one.
 */
const CELL_MAX = 120;

function tooLongForCell(text: string): boolean {
  return text.length > CELL_MAX && /\s/.test(text);
}

function scalarLine(value: string | number | boolean): string {
  if (typeof value === "string" && isUrl(value)) return `<${value}>`;
  return String(value);
}

/**
 * A pipe is structural in a GFM table; a newline ends the row. An
 * array of scalars flattens to a comma list rather than to JSON: a
 * cell reading `status-402, no-accepts` is the same fact as
 * `["status-402","no-accepts"]` and one of them is a sentence.
 */
export function markdownCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const text = Array.isArray(value)
    ? value.map((item) => String(item)).join(", ")
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  return text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ") || "—";
}

function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * An array of objects becomes a table only when a table would not
 * lie: every row the same shape, every cell short. One long sentence
 * in one cell makes a table that is harder to read than the list it
 * replaced, so the list is the fallback rather than the exception.
 *
 * THE CEILING IS TWELVE COLUMNS, not six, and a scalar array counts
 * as a cell. /doors is why: 2,862 host rows of ten fields each, one
 * of them a list of failed check names. Under the first draft's
 * limits that array fell through to the per-item heading form, which
 * rendered the same facts as 2,862 headed blocks and a megabyte of
 * markdown for a document whose JSON is 883 KB and whose HTML is 576.
 * A wide table is still a table; a collection this size rendered as
 * prose is not a document anybody reads.
 */
function tabular(items: readonly unknown[]): readonly string[] | null {
  if (items.length < 2) return null;
  if (!items.every(isPlainObject)) return null;
  const first = items[0] as Record<string, unknown>;
  const keys = Object.keys(first);
  if (keys.length === 0 || keys.length > 12) return null;
  for (const item of items) {
    const row = item as Record<string, unknown>;
    const rowKeys = Object.keys(row);
    if (rowKeys.length !== keys.length) return null;
    if (!keys.every((key, index) => rowKeys[index] === key)) return null;
    for (const key of keys) {
      const value = row[key];
      const flat = Array.isArray(value) && value.every(isScalar) ? value.join(", ") : value;
      if (!isScalar(flat) && flat !== null && flat !== undefined) return null;
      if (typeof flat === "string" && tooLongForCell(flat)) return null;
    }
  }
  return keys;
}

/**
 * WHAT NAMES AN ITEM IN A LIST. The first of these a record carries
 * becomes its heading, in this order, because a clause keyed on
 * `question` and a host row keyed on `host` both have a name — it is
 * just not spelled `name`. A record with none of them falls back to
 * its position, which is honest and useless, so the list is worth
 * widening whenever a real collection lands on `Item 1`.
 */
const IDENTITY_KEYS = [
  "name",
  "title",
  "id",
  "question",
  "label",
  "host",
  "surface",
  "signal",
  "term",
  "class",
  "week",
  "date",
  "verdict",
] as const;

function identify(item: Record<string, unknown>): [string | null, string | null] {
  for (const key of IDENTITY_KEYS) {
    const value = item[key];
    if (typeof value === "string" && value.trim() && !tooLongForCell(value)) {
      return [key, value.trim()];
    }
  }
  return [null, null];
}

function omit(item: Record<string, unknown>, key: string): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(item)) {
    if (name !== key) rest[name] = value;
  }
  return rest;
}

function heading(depth: number, text: string): string {
  // h1 is the document title; sections start at h2 and stop at h6,
  // past which a deeper level is a bolded label rather than a lie
  // about the outline.
  const level = Math.min(depth + 2, 6);
  return `${"#".repeat(level)} ${text}`;
}

function renderValue(
  key: string,
  value: unknown,
  depth: number,
  /**
   * True when EVERY sibling at this level is a one-line fact, so the
   * whole level can be a bullet list with no heading among them.
   *
   * The rule is all-or-nothing per level, and the first draft's
   * cleverer version is why. It made a fact a bullet until a sibling
   * opened a section, then switched to headings — which on a document
   * whose first key is a paragraph turned a tidy list of nine URLs
   * into nine headings, and on a document that opened with the URLs
   * left them dangling under whatever heading came next. A bullet
   * following a heading reads as belonging to that heading; ordering
   * is content in these documents and must not be sorted around the
   * problem. So: a level is a list or it is sections, never both.
   */
  asBullet: boolean,
): string[] {
  const label = humaniseKey(key);

  if (value === null || value === undefined) return [];

  if (isScalar(value)) {
    const text = scalarLine(value);
    if (!asBullet) return [heading(depth, label), "", text, ""];
    return [`- **${label}** — ${text}`];
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return asBullet ? [`- **${label}** — none`] : [heading(depth, label), "", "none", ""];
    }
    if (value.every(isScalar)) {
      return [
        heading(depth, label),
        "",
        ...value.map((item) => `- ${scalarLine(item as string | number | boolean)}`),
        "",
      ];
    }
    const keys = tabular(value);
    if (keys) {
      return [
        heading(depth, label),
        "",
        `| ${keys.map((k) => humaniseKey(k)).join(" | ")} |`,
        `| ${keys.map(() => "---").join(" | ")} |`,
        ...value.map(
          (item) =>
            `| ${keys.map((k) => markdownCell((item as Record<string, unknown>)[k])).join(" | ")} |`,
        ),
        "",
      ];
    }
    const blocks: string[] = [heading(depth, label), ""];
    value.forEach((item, index) => {
      if (isScalar(item)) {
        blocks.push(`- ${scalarLine(item)}`, "");
        return;
      }
      if (isPlainObject(item)) {
        const [key, name] = identify(item);
        blocks.push(heading(depth + 1, name ?? `Item ${index + 1}`), "");
        // The field used as the heading is not repeated underneath it.
        // /rights renders a clause as its question; printing the
        // question again as the first child reads as a stutter.
        const rest = key ? omit(item, key) : item;
        blocks.push(...renderObject(rest, depth + 2));
        return;
      }
      blocks.push(`- ${JSON.stringify(item)}`, "");
    });
    return blocks;
  }

  if (isPlainObject(value)) {
    return [heading(depth, label), "", ...renderObject(value, depth + 1)];
  }

  return [];
}

/** A level every one of whose values fits on a line beside its label. */
function allInline(document: Record<string, unknown>): boolean {
  const values = Object.values(document).filter((value) => value !== null && value !== undefined);
  if (values.length === 0) return false;
  return values.every(
    (value) => isScalar(value) && !(typeof value === "string" && value.length > INLINE_MAX),
  );
}

function renderObject(document: Record<string, unknown>, depth: number): string[] {
  const asBullet = allInline(document);
  const lines: string[] = [];
  for (const [key, value] of Object.entries(document)) {
    const rendered = renderValue(key, value, depth, asBullet);
    if (rendered.length === 0) continue;
    lines.push(...rendered);
  }
  if (asBullet) lines.push("");
  return lines;
}

export interface JsonDocumentMarkdown {
  base: string;
  /** The page's own path, e.g. "/corpus". Used for canonical and url. */
  path: string;
  title: string;
  description: string;
  /** Where the same document is served as JSON, when that differs. */
  dataUrl?: string;
  document: Record<string, unknown>;
}

/**
 * FRONT MATTER FIRST, because the readers that go looking for a `.md`
 * twin are the readers that parse it: title and description are the
 * two fields every one of them reads, and `canonical` is how the twin
 * says it is the same document as the page rather than a second one
 * competing with it.
 */
export function jsonDocumentMarkdown({
  base,
  path,
  title,
  description,
  dataUrl,
  document,
}: JsonDocumentMarkdown): string {
  const front = [
    "---",
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    `canonical: "${base}${path}"`,
    `url: "${base}${path}"`,
    ...(dataUrl ? [`data: "${dataUrl}"`] : []),
    "---",
  ];
  const body = renderObject(document, 0);
  return [...front, "", `# ${title}`, "", description, "", ...body]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
    .concat("\n");
}

/**
 * The same document as a response, so nine routes cannot come to
 * disagree about the content type or forget the Vary that keeps a
 * CDN from handing one caller's markdown to the next caller's
 * browser.
 */
export function jsonDocumentMarkdownResponse(input: JsonDocumentMarkdown): Response {
  return new Response(jsonDocumentMarkdown(input), {
    headers: { "Content-Type": MARKDOWN_MEDIA_TYPE, Vary: VARY_ACCEPT },
  });
}
