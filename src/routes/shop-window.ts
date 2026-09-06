import { Hono } from "hono";
import { readShopWindow, WINDOW_SIZE } from "@/services/shop-window";
import type { HonoEnv } from "@/types";

/**
 * THE SHOP WINDOW'S TWO DOORS: the feed the front page reads, and the
 * handful of JavaScript that keeps it moving.
 *
 * The window is SERVER-RENDERED FIRST (see pages/storefront-page.ts):
 * a visitor with no JavaScript, a crawler, and an answer engine all
 * get the last few sales in the HTML, in words, with no script
 * involved. What this file adds is the "running" half of the keeper's
 * ask — the rows refresh in place while somebody is looking at the
 * page, so a sale that lands while they read shows up without them
 * reloading.
 *
 * PROGRESSIVE ENHANCEMENT, NOT A DEPENDENCY. If the script never
 * loads, never runs, or the fetch fails, the page keeps exactly the
 * window the server drew. Nothing on this page waits on the network to
 * be readable, which is the same property /till.js was built to keep.
 *
 * NOT A PUBLISHED INSTRUMENT — yet, and that is a decision rather than
 * an omission. The feed is the storefront's own furniture: it is not
 * in /openapi.json, not in the API catalog, not on llms.txt, and it
 * carries no version. Whether "what other agents are buying" becomes a
 * documented door with a contract behind it is the keeper's call and a
 * separate one; until he makes it, nothing outside this store's own
 * front page is invited to depend on the shape.
 */
export const shopWindowRoutes = new Hono<HonoEnv>();

/**
 * How often the glass refreshes, in milliseconds.
 *
 * A minute, and only while the tab is actually being looked at. This
 * store sells a handful of things a week: a tighter loop would spend
 * a KV read every few seconds to redraw the identical five rows, and
 * "live" at that price is a cost with no reader behind it. Paired with
 * the max-age below, an open tab costs one read a minute at most, and
 * a backgrounded one costs nothing at all.
 */
const REFRESH_MS = 60_000;

shopWindowRoutes.get("/shop-window.json", async (c) => {
  const glass = await readShopWindow(c.env, WINDOW_SIZE);
  return c.json(glass, 200, {
    /*
     * Half the refresh interval: a second tab, a reload, or a shopper
     * clicking back to the front page inside thirty seconds is served
     * from the browser's own copy rather than another walk of KV. The
     * same shape /api/bounties uses, at half the age, because this one
     * is the thing that is supposed to look live.
     */
    "Cache-Control": "public, max-age=30",
  });
});

/**
 * The script, written out here rather than kept in a file of its own:
 * it is short enough to read in one screen and it has exactly one job.
 * ES5 on purpose — the same discipline /webmcp.js keeps, so nothing
 * about which browsers can read this page depends on a transpiler.
 *
 * IT BUILDS NODES, IT NEVER ASSIGNS HTML. Every value from the feed
 * lands through textContent or setAttribute on an href the store
 * itself wrote, so there is no path from a stored item key to markup
 * — the same rule the rest of the store follows on the server side
 * (agent-authored text is stored as written and escaped everywhere it
 * renders), kept on the one surface that renders in the browser.
 */
function shopWindowScript(): string {
  return `(function () {
  var list = document.querySelector("[data-shop-window]");
  if (!list || !window.fetch) return;
  var empty = list.getAttribute("data-empty") || "";

  function signatureOf(sales) {
    return sales
      .map(function (sale) { return sale.name + "|" + sale.when; })
      .join("~");
  }

  // WHAT THE SERVER ALREADY DREW, in the same form a fetched window
  // takes. Starting from an empty string instead would make the first
  // poll either a pointless repaint of identical rows (and a pointless
  // announcement to a screen reader) or, on a window the server drew
  // full and the feed came back empty for, no repaint at all.
  var painted = (function () {
    var drawn = list.querySelectorAll(".sold-row");
    var rows = [];
    for (var i = 0; i < drawn.length; i++) {
      var what = drawn[i].querySelector(".sold-what");
      var when = drawn[i].querySelector(".sold-when");
      rows.push({
        name: what ? what.textContent : "",
        when: when ? when.textContent : "",
      });
    }
    return signatureOf(rows);
  })();

  function row(sale) {
    var li = document.createElement("li");
    li.className = "sold-row";
    var link = document.createElement("a");
    link.className = "sold-what";
    link.setAttribute("href", sale.href);
    link.textContent = sale.name;
    var when = document.createElement("span");
    when.className = "sold-when";
    when.textContent = sale.when;
    li.appendChild(link);
    li.appendChild(when);
    return li;
  }

  function paint(sales) {
    // Redraw only on a real change: an unchanged repaint every minute
    // would flicker the page and re-announce the same rows to a screen
    // reader, which is the opposite of what a live region is for.
    var signature = signatureOf(sales);
    if (signature === painted) return;
    painted = signature;
    while (list.firstChild) list.removeChild(list.firstChild);
    if (sales.length === 0) {
      var none = document.createElement("li");
      none.className = "sold-none";
      none.textContent = empty;
      list.appendChild(none);
      return;
    }
    for (var i = 0; i < sales.length; i++) list.appendChild(row(sales[i]));
  }

  function look() {
    if (document.hidden) return;
    fetch("/shop-window.json", { headers: { Accept: "application/json" } })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (body) {
        if (body && Object.prototype.toString.call(body.sales) === "[object Array]") {
          paint(body.sales);
        }
      })
      .catch(function () { /* the server's window stays up; nothing to say */ });
  }

  setInterval(look, ${REFRESH_MS});
  // Coming back to a tab that has been away for an hour should not wait
  // out the interval before the glass is honest again.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) look();
  });
})();
`;
}

shopWindowRoutes.get("/shop-window.js", (c) =>
  c.body(shopWindowScript(), 200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
  }),
);
