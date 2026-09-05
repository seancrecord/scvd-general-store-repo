import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDirectoryDoors, readDirectoryDoors } from "@/services/directory-doors";

/**
 * LANE C (2026-09-05): the directory's page for a host, read as a
 * feed. What this holds: a path on the page is joined to the host it
 * is listed under and nothing else; an absolute URL on another host
 * is foreign; a target the probe law refuses is refused; a page
 * naming no path is "none", a missing page is "none", a directory
 * that sends us elsewhere is unreadable; and our own host is never
 * read at all.
 */
const OWN = "scvd.store";
const page = (spans: string[]) =>
  `<ul class="results">${spans.map((s) => `<li><a class="result" href="/endpoint/1"><span class="r-host">${s}</span><span class="r-path">${s}</span></a></li>`).join("")}</ul>`;

afterEach(() => vi.unstubAllGlobals());

describe("parseDirectoryDoors", () => {
  it("joins each listed path to the host the page is for, once", () => {
    const parsed = parseDirectoryDoors(page(["/v1/a", "/v1/b", "/v1/a"]), "payforapi.com", OWN);
    expect(parsed).toEqual({
      doors: ["https://payforapi.com/v1/a", "https://payforapi.com/v1/b"],
      foreign: 0,
      refused: 0,
      capped: false,
    });
  });

  it("counts an absolute URL on another host as foreign and never as a door", () => {
    const parsed = parseDirectoryDoors(page(["/v1/a", "https://victim.example/door"]), "payforapi.com", OWN);
    expect(parsed.doors).toEqual(["https://payforapi.com/v1/a"]);
    expect(parsed.foreign).toBe(1);
  });

  it("refuses what the probe law refuses, and says so", () => {
    const parsed = parseDirectoryDoors(page(["/v1/a"]), "127.0.0.1", OWN);
    expect(parsed.doors).toEqual([]);
    expect(parsed.refused).toBe(1);
  });

  it("names no door from markup that carries no path", () => {
    expect(parseDirectoryDoors('<a href="/provider/x.example">x.example</a>', "x.example", OWN)).toEqual({
      doors: [],
      foreign: 0,
      refused: 0,
      capped: false,
    });
  });
});

describe("readDirectoryDoors", () => {
  function stub(answer: (url: URL) => Response) {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => answer(new URL(String(input instanceof Request ? input.url : input))));
  }

  it("reads the page for the host, from the directory, and says via directory", async () => {
    stub((u) => {
      expect(u.host).toBe("x402.fuchss.app");
      expect(u.pathname).toBe("/provider/payforapi.com");
      return new Response(page(["/v1/pochta-tariff"]));
    });
    const read = await readDirectoryDoors("payforapi.com", OWN);
    expect(read).toEqual({
      kind: "doors",
      declaring_host: "payforapi.com",
      doors: ["https://payforapi.com/v1/pochta-tariff"],
      foreign: 0,
      refused: 0,
      capped: false,
      via: "directory",
    });
  });

  it("a missing page is none; a page naming no path is none; a refusal is unreadable", async () => {
    stub(() => new Response("", { status: 404 }));
    expect(await readDirectoryDoors("nobody.example", OWN)).toEqual({ kind: "none", via: "directory" });
    stub(() => new Response("<p>no endpoints</p>"));
    expect(await readDirectoryDoors("quiet.example", OWN)).toEqual({ kind: "none", via: "directory" });
    stub(() => new Response("busy", { status: 503 }));
    expect((await readDirectoryDoors("busy.example", OWN)).kind).toBe("unreadable");
  });

  it("never reads our own host, and never a redirect off the directory", async () => {
    let asked = 0;
    stub(() => {
      asked += 1;
      return new Response(page(["/x"]));
    });
    expect((await readDirectoryDoors(OWN, OWN)).kind).toBe("unreadable");
    expect(asked).toBe(0);
    vi.stubGlobal("fetch", async () => {
      const response = new Response(page(["/x"]));
      Object.defineProperty(response, "url", { value: "https://elsewhere.example/provider/a.example" });
      return response;
    });
    const read = await readDirectoryDoors("a.example", OWN);
    expect(read.kind).toBe("unreadable");
    if (read.kind === "unreadable") expect(read.reason).toContain("redirected");
  });
});
