import { escapeHtml } from "@/lib/sanitize";
import { STOREFRONT_CSS } from "@/pages/storefront-css";
import { STORE_METADATA } from "@/store";

/**
 * A plain paper page in the storefront's hand, for the smaller rooms:
 * the Town Directory, the retired-words registry, the Gazette rack.
 * Callers pass pre-escaped HTML for the body sections.
 */

export interface SimplePageOptions {
  title: string;
  /** Pre-escaped HTML sections, rendered inside the paper. */
  bodyHtml: string;
}

export function renderSimplePage(options: SimplePageOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(options.title)} — ${escapeHtml(STORE_METADATA.name)}</title>
  <style>${STOREFRONT_CSS}</style>
</head>
<body>
  <main class="paper">
    <header>
      <p class="est">${escapeHtml(STORE_METADATA.name)} \u2022 ${escapeHtml(STORE_METADATA.location)}</p>
      <h1>${escapeHtml(options.title)}</h1>
    </header>
    ${options.bodyHtml}
    <div class="fine-print">
      <p><a href="/">Back to the front of the store</a>. Agents: <a href="/llms.txt"><code>/llms.txt</code></a>, <a href="/skill.md"><code>/skill.md</code></a>, or <a href="/menu.json"><code>/menu.json</code></a>.</p>
    </div>
  </main>
</body>
</html>`;
}

/** True when the caller is a person with a browser, not an agent. */
export function wantsHtml(acceptHeader: string | undefined): boolean {
  return (acceptHeader ?? "").includes("text/html");
}
