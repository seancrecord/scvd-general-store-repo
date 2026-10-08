import { escapeHtml } from "@/lib/sanitize";
import { organizationRef } from "@/lib/jsonld";
import {
  WRITTEN_ABOUT,
  WRITING_HEADING,
  WRITING_DISCLOSURE,
  WRITER_RECOGNITION,
  writerRecognitionText,
} from "@/store/copy/asked-for";

/** The keeper's profiles describe one person; neither identifies the business. */
export function keeperAuthorJsonLd(base: string) {
  return {
    "@type": "Person",
    "@id": `${base}/#keeper`,
    name: WRITER_RECOGNITION.author.name,
    url: WRITER_RECOGNITION.author.url,
    sameAs: [...new Set(WRITTEN_ABOUT.map((piece) => piece.author.url))],
    worksFor: organizationRef(base),
  };
}

/** Use the same destinations in both directions; unrelated rooms get no box. */
export function relatedWritingHtml(path?: string): string {
  const articles = WRITTEN_ABOUT.filter((piece) => piece.related.path === path);
  if (!articles.length) return "";
  return `<section id="related-writing" aria-labelledby="related-writing-heading">
    <h2 id="related-writing-heading">From the keeper's notebook</h2>
    <p class="menu-desc">${escapeHtml(WRITING_DISCLOSURE)}</p>
    ${articles.map((piece) => `<p class="menu-desc"><a href="${escapeHtml(piece.url)}">${escapeHtml(piece.title)}</a> — ${escapeHtml(piece.where)}, <time datetime="${escapeHtml(piece.datePublished)}">${escapeHtml(piece.datePublished)}</time>. ${escapeHtml(piece.description)}</p>`).join("\n")}
  </section>`;
}

/** Plain HTML near the footer: the metadata's facts remain available to people. */
export function writingSectionHtml(): string {
  const articles = [...WRITTEN_ABOUT].sort((a, b) => b.datePublished.localeCompare(a.datePublished));
  return `<section class="what-this-is" id="writing-recognition" aria-labelledby="writing-heading">
      <h2 class="night-head" id="writing-heading">${escapeHtml(WRITING_HEADING)}</h2>
      <p class="what-line">${escapeHtml(WRITING_DISCLOSURE)}</p>
      <p class="what-line" id="keeper">The keeper runs the store and writes as ${escapeHtml(WRITER_RECOGNITION.author.name)} on ${[...new Map(WRITTEN_ABOUT.map((piece) => [piece.author.url, piece.where])).entries()].map(([url, publisher]) => `<a href="${escapeHtml(url)}" rel="author">${escapeHtml(publisher)}</a>`).join(" and ")}.</p>
      ${articles.map((piece) => `<p class="what-line">
        <a href="${escapeHtml(piece.url)}">${escapeHtml(piece.title)}</a><br>
        ${escapeHtml(piece.where)} · <time datetime="${escapeHtml(piece.datePublished)}">${escapeHtml(piece.datePublished)}</time> · by <a href="${escapeHtml(piece.author.url)}" rel="author">${escapeHtml(piece.author.name)}</a><br>
        ${escapeHtml(piece.description)} <a href="${escapeHtml(piece.related.path)}">${escapeHtml(piece.related.label)}</a>.
      </p>`).join("\n")}
      <p class="what-line">${escapeHtml(writerRecognitionText())} <a href="${escapeHtml(WRITER_RECOGNITION.sourceUrl)}">Writers list</a> · <a href="${escapeHtml(WRITER_RECOGNITION.evidenceUrl)}">Dated screenshot</a>.</p>
    </section>`;
}
