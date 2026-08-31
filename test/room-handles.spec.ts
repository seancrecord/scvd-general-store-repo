import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { roomHandles } from "@/pages/simple-page";

const BASE = "https://scvd.store";
const AS_A_BROWSER = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

/**
 * HANDLES A SCRIPT CAN HOLD — door 4 of the six-door reading.
 *
 * The lineup's complaint about browser automation is that the agent is
 * left inferring meaning from anonymous divs, and this store shipped
 * exactly that: every anchor point on every room was a style class,
 * and a style class is what a redesign moves. `class="paper"` is a
 * decision about ink, not a statement about what the room is.
 *
 * These hold the fix in place: the landmark carries a handle, the
 * handle derives from the URL rather than from copy, and the shelf
 * rows carry the same item ids the API and the till use.
 */
async function html(path: string): Promise<string> {
  const response = await SELF.fetch(`${BASE}${path}`, { headers: AS_A_BROWSER });
  expect(response.status, path).toBe(200);
  return response.text();
}

function mainTag(page: string): string {
  return /<main[^>]*>/.exec(page)?.[0] ?? "";
}

describe("every room hands an automation tool something to hold", () => {
  it("the storefront's main landmark names itself", async () => {
    expect(mainTag(await html("/"))).toContain('data-room="storefront"');
  });

  it("each room's main landmark names the room, not the copy", async () => {
    for (const path of ["/conformance", "/corpus", "/what", "/criteria", "/menu"]) {
      const tag = mainTag(await html(path));
      const room = path.slice(1);
      expect(tag, `${path} landmark`).toContain(`data-room="${room}"`);
    }
  });

  it("an item page names its room AND which item it landed on", async () => {
    const item = MENU_ITEMS[0]!;
    const tag = mainTag(await html(`/menu/${item.id}`));
    // The ROOM is the template a script targets; the ITEM is the
    // instance. A selector written against [data-room="menu"] keeps
    // working when the shelf gains an item.
    expect(tag).toContain('data-room="menu"');
    expect(tag).toContain(`data-item="${item.id}"`);
  });

  it("the shelf rows carry the ids the API uses, not display names", async () => {
    const page = await html("/menu");
    for (const item of MENU_ITEMS) {
      expect(page, `${item.id} row`).toContain(`data-item="${item.id}"`);
    }
  });
});

describe("the handles derive from the URL, which is the part that is a contract", () => {
  it("splits a path into room and item", () => {
    expect(roomHandles("/conformance")).toBe(' data-room="conformance"');
    expect(roomHandles("/menu/hello")).toBe(
      ' data-room="menu" data-item="hello"',
    );
    expect(roomHandles("/")).toBe(' data-room="storefront"');
  });

  it("gives no handle rather than a guessed one when there is no path", () => {
    // An unstable handle is worse than an absent one: absent fails
    // loudly at the selector, invented fails silently at the wrong
    // element. Deriving from a title would be deriving from copy.
    expect(roomHandles(undefined)).toBe("");
  });

  it("escapes what it puts in an attribute", () => {
    expect(roomHandles('/a"onload=x')).not.toContain('"onload=x');
  });
});
