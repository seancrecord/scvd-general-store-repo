/**
 * A JSONC reader small enough to trust: strips block and line comments
 * outside strings, then JSON.parse. Wrangler's own config files carry
 * long block comments and URLs with `//` inside strings, so a regex
 * over the whole text is exactly the wrong tool.
 */
export function parseJsonc(text) {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') {
        if (text[j] === "\\") j += 1;
        j += 1;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? n : end;
      continue;
    }
    out += ch;
    i += 1;
  }
  // trailing commas, which JSONC allows and JSON does not
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}
