/** One channel notice for the wall, guestbook and agent posting instructions. */
export const GUESTBOOK_CHANNEL_NOTICE =
  "The wall is our guestbook. Questions for the keeper go through the mailbox at /api/letter. Field Study participation rules are on /field-study.";

/** Static house copy only, never visitor input. */
export function guestbookChannelHtml(): string {
  return GUESTBOOK_CHANNEL_NOTICE
    .replace("/api/letter", '<a href="/api/letter">/api/letter</a>')
    .replace("/field-study", '<a href="/field-study">/field-study</a>');
}
