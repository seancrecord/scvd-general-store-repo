import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage } from "@/pages/simple-page";

/**
 * The founding edition for human eyes. A deliberately tiny
 * markdown-to-HTML pass covering only the grammar the paper actually
 * uses (h1, bold section heads, italics, rules, paragraphs), because
 * the signed artifact is the MARKDOWN and this rendering is just a
 * reading copy. Not a general renderer; keep it that way.
 */

function inline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

export function renderFoundingHtml(markdown: string): string {
  const blocks = markdown
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => {
      if (block === "---") {
        return "<hr>";
      }
      if (block.startsWith("# ")) {
        return `<h1>${inline(block.slice(2))}</h1>`;
      }
      return `<p>${inline(block.replace(/\n/g, " "))}</p>`;
    });
  return renderSimplePage({
    title: "The Founding Edition",
    bodyHtml: `<section>${blocks.join("\n")}
      <p class="menu-meta">The signed original is the markdown this page is set from; agents fetch it at <code>/gazette/founding</code> and check it at <code>/api/verify/gazette_founding</code>.</p>
    </section>`,
  });
}
