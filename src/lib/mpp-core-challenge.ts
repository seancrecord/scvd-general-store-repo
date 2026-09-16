/** Strict auth-param reading for the new core battery. The historical parser stays frozen. */
export interface CoreChallenge {
  params: Record<string, string>;
  syntax: boolean;
  custom_names_lowercase: boolean;
}
const CORE_PARAMS = new Set(["id", "realm", "method", "intent", "request", "expires", "digest", "description", "header", "opaque"]);
const TOKEN = "[!#$%&'*+.^_`|~0-9A-Za-z-]+";
const PARAM = new RegExp(`^(${TOKEN})[ \\t]*=[ \\t]*(.*)$`);
const SCHEME = new RegExp(`^(${TOKEN})(?:([ \\t]+)(.*))?$`);
const TOKEN_VALUE = new RegExp(`^${TOKEN}$`);

/** Header lists split only outside quoted strings; escaped commas/quotes remain data. */
export function headerParts(value: string): { parts: string[]; complete: boolean } {
  const parts: string[] = [];
  let start = 0; let quoted = false; let escaped = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (escaped) { escaped = false; continue; }
    if (quoted && c === "\\") { escaped = true; continue; }
    if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) { parts.push(value.slice(start, i)); start = i + 1; }
  }
  parts.push(value.slice(start));
  return { parts, complete: !quoted && !escaped };
}

function paramValue(raw: string): string | null {
  if (!raw.startsWith('"')) return TOKEN_VALUE.test(raw) ? raw : null;
  let value = "";
  for (let i = 1; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c === 34) return i === raw.length - 1 ? value : null;
    if (c === 92) {
      if (++i >= raw.length) return null;
      const escaped = raw.charCodeAt(i);
      if (!(escaped === 9 || (escaped >= 32 && escaped <= 126) || (escaped >= 128 && escaped <= 255))) return null;
      value += raw[i];
    } else {
      if (!(c === 9 || c === 32 || c === 33 || (c >= 35 && c <= 91) || (c >= 93 && c <= 126) || (c >= 128 && c <= 255))) return null;
      value += raw[i];
    }
  }
  return null;
}

export function coreChallenges(value: string): { challenges: CoreChallenge[]; complete: boolean } {
  const { parts, complete } = headerParts(value);
  const challenges: CoreChallenge[] = [];
  let current: CoreChallenge | null = null;
  let scheme: string | null = null;
  let paramsAllowed = false;
  const add = (match: RegExpMatchArray) => {
    if (!current) return;
    // A comma cannot supply the required space after the scheme.
    if (!paramsAllowed) current.syntax = false;
    const name = match[1]!.toLowerCase();
    if (!CORE_PARAMS.has(name) && match[1] !== name) current.custom_names_lowercase = false;
    const parsed = paramValue(match[2]!.trim());
    if (parsed === null || Object.hasOwn(current.params, name)) current.syntax = false;
    else current.params[name] = parsed;
  };
  for (const part of parts) {
    const item = part.trim();
    if (!item) continue;
    const param = item.match(PARAM);
    if (param && scheme !== null) { add(param); continue; }
    const next = item.match(SCHEME);
    if (!next) { if (current) current.syntax = false; continue; }
    scheme = next[1]!.toLowerCase();
    paramsAllowed = next[2] !== undefined;
    current = scheme === "payment" ? { params: Object.create(null) as Record<string, string>, syntax: !next[2]?.includes("\t"), custom_names_lowercase: true } : null;
    if (current) challenges.push(current);
    if (next[3]) {
      const first = next[3].match(PARAM);
      if (first) add(first);
      else if (current) current.syntax = false; // Payment has auth-params, never token68.
    }
  }
  if (!complete) for (const challenge of challenges) challenge.syntax = false;
  return { challenges, complete };
}
