import { notesFromATuesdayInOakCity } from "@/store/almanac/notes-from-a-tuesday-in-oak-city";
import type { AlmanacEntry } from "@/types";

/**
 * The Keeper's Almanac: a serialized journal, one markdown page per file
 * in this folder, a penny a page. Newest entries first. To add a page,
 * drop a new file here and add it to the list below.
 *
 * Content rule: entries are dated, first-person field notes — sensory,
 * particular, slightly strange, in the KEEPER'S OWN WORDS (his voice is
 * non-delegable here; the machine structures, never invents). Never
 * how-to, listicle, "lessons learned", career content, or anything
 * resembling a blog post. If it could be posted on Medium, it doesn't
 * go in the Almanac. The brisket placeholder was shelved 2026-07-23 for
 * exactly this reason: a cook he never narrated is fiction, and the
 * Almanac doesn't carry fiction.
 */
export const ALMANAC_ENTRIES: readonly AlmanacEntry[] = [
  notesFromATuesdayInOakCity,
] as const;

export function getAlmanacEntry(slug: string): AlmanacEntry | undefined {
  return ALMANAC_ENTRIES.find((entry) => entry.slug === slug);
}
