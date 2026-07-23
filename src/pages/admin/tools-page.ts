import { renderAdminShell } from "@/pages/admin/layout";

/**
 * The back shelf: levers pulled rarely and on purpose. Nothing here
 * loads data, so this page always opens, even when KV is having a day.
 */

export function renderToolsPage(): string {
  const body = `
  <section>
    <h2>Monthly patronage note</h2>
    <p>Served, signed, to every current recurring_patronage pass this month.</p>
    <form method="POST" action="/admin/patronage/note">
      <input type="text" name="monthly_note" placeholder="This month's note to standing patrons" maxlength="1000" required>
      <button type="submit">Ink it for ${new Date().toISOString().slice(0, 7)}</button>
    </form>
  </section>

  <section>
    <h2>Gazette dispatch (from approved tips)</h2>
    <p>Assembles a penny dispatch from approved Trading Post tips; credits contributors, mints their stamps.</p>
    <form method="POST" action="/admin/gazette/publish">
      <input type="text" name="title" placeholder="Issue title" maxlength="200" required>
      <input type="text" name="tip_ids" placeholder="Approved tip ids, comma-separated" required>
      <button type="submit">Publish dispatch</button>
    </form>
    <form method="POST" action="/admin/gazette/edition/assemble">
      <button type="submit">Hand-set a weekly-edition draft now (ignores the gate; edit it at the counter)</button>
    </form>
  </section>

  <section>
    <h2>Test levers</h2>
    <form method="POST" action="/admin/alerts/test">
      <button type="submit">Fire a test alert (confirms email delivery once)</button>
    </form>
    <form method="POST" action="/admin/inventory/reset">
      <button type="submit">Reset weekly inventory counts</button>
    </form>
  </section>

  <section>
    <h2>Odds and ends</h2>
    <p><a href="/admin/digest">Latest weekly digest (JSON)</a></p>
  </section>`;
  return renderAdminShell("tools", body);
}
