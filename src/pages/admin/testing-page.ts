import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";

/**
 * THE TEST DRAWER: levers that exist to prove other machinery works,
 * moved off the back shelf so the daily room only shows daily work.
 * Deliberately not in the nav — reached from the back shelf's
 * pointer. Everything here is safe to press; nothing moves money.
 */
export interface TestingPageData {
  /** item id -> units sold this week; null when unreadable. */
  inventory: Record<string, number> | null;
}

/** Every lever states its condition (2026-07-30 rule) — moving a
 * lever to this drawer moved its reading with it. */
function inventoryCondition(inventory: Record<string, number> | null): string {
  if (inventory === null) {
    return `<p><strong style="color:#8c2f1b">Couldn't read this.</strong> The lever below still works; what it will clear is not being guessed at here.</p>`;
  }
  const entries = Object.entries(inventory);
  if (entries.length === 0) {
    return `<p><strong>Nothing sold against a weekly cap this week.</strong></p>`;
  }
  return `<p><strong>This week: ${entries
    .map(([item, sold]) => `${escapeHtml(item)} ${sold}`)
    .join(" · ")}</strong></p>`;
}

export function renderTestingPage(
  data: TestingPageData,
  loadNotes: string[] = [],
): string {
  const body = `
  <section>
    <p>Levers for proving the machinery, not for running the store.
    Nothing here moves money or touches a customer.</p>
  </section>

  <section>
    <h2>Test the alarm</h2>
    <p>Sends one test page through the alert mail so you know the
    wire is connected before you need it.</p>
    <form method="post" action="/admin/alerts/test" style="margin:0.5em 0">
      <button type="submit">Send a test alert</button>
    </form>
  </section>

  <section>
    <h2>Reset weekly inventory</h2>
    <p>Clears the weekly caps early. They reset on their own when the
    week turns; this exists for testing the caps machinery.</p>
    ${inventoryCondition(data.inventory)}
    <form method="post" action="/admin/inventory/reset" style="margin:0.5em 0">
      <button type="submit">Reset weekly caps</button>
    </form>
  </section>`;
  return renderAdminShell("testing", body, loadNotes);
}
