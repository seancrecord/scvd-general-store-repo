import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  MCP_WARD_IS_NOT,
  foldPass,
  readPageRows,
  type McpRegister,
  type McpWalkState,
} from "@/services/mcp-ward";

const BASE = "https://scvd.store";

/**
 * THE MCP WARD'S TWO PROMISES, and both are refusals.
 *
 * It shares no total with the x402 ward. Folding the two populations
 * would have silently redefined what every coverage percentage this
 * store has sealed since July was a percentage OF — retroactively,
 * with no correction possible, because the old rows keep their bytes
 * while their meaning moves underneath them.
 *
 * And it records no delisting from a partial read. That is the
 * population layer's founding law arriving in a second instrument: a
 * partial enumeration cannot tell "delisted" from "on a page we never
 * reached", and a fabricated delisting is a wrong claim about
 * somebody's project inside a record we do not rewrite.
 */

function state(hosts: string[], truncated = false): McpWalkState {
  return {
    version: 1,
    week: "2026-W36",
    started_at: "2026-09-06T00:00:00.000Z",
    cursor: null,
    pages_read: 3,
    servers_seen: 300,
    hosts,
    status_counts: { active: 290, deprecated: 10 },
    servers_with_remote: hosts.length,
    truncated,
  };
}

const EMPTY: McpRegister = { version: 1, hosts: {}, last_pass: null };

describe("reading the registry's own rows", () => {
  it("counts a row with no remote and takes no host from it", () => {
    const read = readPageRows([
      {
        server: { name: "a/pkg" },
        _meta: { "io.modelcontextprotocol.registry/official": { status: "active" } },
      },
      {
        server: { remotes: [{ url: "https://alpha.example/mcp" }] },
        _meta: { "io.modelcontextprotocol.registry/official": { status: "active" } },
      },
    ]);
    // Both rows counted by status; only one contributed a host.
    expect(read.statuses["active"]).toBe(2);
    expect(read.withRemote).toBe(1);
    expect(read.hosts).toEqual(["alpha.example"]);
  });

  it("counts a row whose status the registry did not state", () => {
    const read = readPageRows([{ server: { remotes: [] } }]);
    expect(read.statuses["unstated"]).toBe(1);
  });

  it("takes every remote a row declares, not just the first", () => {
    const read = readPageRows([
      {
        server: {
          remotes: [
            { url: "https://one.example/mcp" },
            { url: "https://two.example/mcp" },
          ],
        },
      },
    ]);
    expect(read.hosts.sort()).toEqual(["one.example", "two.example"]);
    // Still ONE row, however many addresses it declared.
    expect(read.withRemote).toBe(1);
  });

  it("skips a remote whose url is not a host rather than inventing one", () => {
    const read = readPageRows([{ server: { remotes: [{ url: "not a url at all" }] } }]);
    expect(read.hosts).toEqual([]);
    expect(read.withRemote).toBe(0);
  });
});

describe("a completed pass records mortality", () => {
  it("records what appeared on the first pass and claims no deaths", () => {
    const { register, pass } = foldPass(
      EMPTY,
      state(["a.example", "b.example"]),
      "2026-09-06T12:00:00.000Z",
    );
    expect(pass.appeared.sort()).toEqual(["a.example", "b.example"]);
    expect(pass.disappeared).toEqual([]);
    expect(Object.keys(register.hosts).sort()).toEqual(["a.example", "b.example"]);
  });

  it("records a host that stopped being listed", () => {
    const first = foldPass(EMPTY, state(["a.example", "b.example"]), "t1");
    const second = foldPass(first.register, state(["a.example"]), "t2");
    expect(second.pass.disappeared).toEqual(["b.example"]);
    expect(second.register.hosts["b.example"]?.unconfirmed).toBe(true);
    // The one still listed keeps its first_seen and advances last_seen.
    expect(second.register.hosts["a.example"]?.first_seen).toBe("t1");
    expect(second.register.hosts["a.example"]?.last_seen).toBe("t2");
  });

  it("records a host listed again after being written off", () => {
    const first = foldPass(EMPTY, state(["a.example", "b.example"]), "t1");
    const second = foldPass(first.register, state(["a.example"]), "t2");
    const third = foldPass(second.register, state(["a.example", "b.example"]), "t3");
    expect(third.pass.returned).toEqual(["b.example"]);
    expect(third.register.hosts["b.example"]?.unconfirmed).toBeUndefined();
    // It is a RETURN, not a new arrival: the original first_seen stands.
    expect(third.register.hosts["b.example"]?.first_seen).toBe("t1");
  });
});

/**
 * THE LAW, held by a test. A truncated pass sees one host where the
 * previous pass saw two — which looks exactly like a delisting and is
 * not one.
 */
describe("a truncated pass records no delisting at all", () => {
  it("refuses the disappearance its own numbers would suggest", () => {
    const first = foldPass(EMPTY, state(["a.example", "b.example"]), "t1");
    const partial = foldPass(first.register, state(["a.example"], true), "t2");
    expect(partial.pass.truncated).toBe(true);
    expect(partial.pass.disappeared).toEqual([]);
    // And the absent host is NOT written off on the register either.
    expect(partial.register.hosts["b.example"]?.unconfirmed).toBeUndefined();
  });

  it("says why, on the pass itself, rather than in a footnote elsewhere", () => {
    const partial = foldPass(EMPTY, state(["a.example"], true), "t1");
    expect(partial.pass.what_this_cannot_see[0]).toContain("PARTIAL");
    expect(partial.pass.what_this_cannot_see.join(" ")).toContain(
      "cannot tell a delisting from a page we never reached",
    );
  });

  it("still records the hosts it did see", () => {
    const partial = foldPass(EMPTY, state(["a.example"], true), "t1");
    expect(partial.pass.appeared).toEqual(["a.example"]);
  });
});

/**
 * THE RED-TEAM FINDING OF 2026-09-04, held so it cannot return: the
 * remote-URL count is a property of the PASS, and a pass is many
 * ticks. The first cut published only the final tick's share under
 * the whole pass's name — a twelfth of the truth on a twelve-tick
 * pass — because the accumulator lived in the tick's local scope.
 */
describe("the remote-URL count belongs to the pass, not the tick", () => {
  it("publishes the accumulated count, not the last batch", () => {
    const s = state(["a.example", "b.example", "c.example"]);
    s.servers_with_remote = 250; // accumulated across ticks, not this tick's 3
    expect(foldPass(EMPTY, s, "t1").pass.servers_with_remote).toBe(250);
  });

  it("treats state written before the field existed as zero, not undefined", () => {
    const s = state(["a.example"]);
    delete s.servers_with_remote;
    expect(foldPass(EMPTY, s, "t1").pass.servers_with_remote).toBe(0);
  });
});

describe("the two wards share nothing", () => {
  it("says so on the ward's own artifact", () => {
    expect(MCP_WARD_IS_NOT).toContain("knocks on");
    const pass = foldPass(EMPTY, state(["a.example"]), "t1").pass;
    expect(pass.what_this_cannot_see.join(" ")).toContain(
      "Anything about the x402 population",
    );
  });

  it("serves a room that names its own denominators and refuses the other's", async () => {
    const response = await SELF.fetch(`${BASE}/mcp-ward.json`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, any>;
    expect(body["artifact"]).toBe("mcp_ward");
    expect(body["separate_from_x402"]).toContain("shares no total");
    // An empty store has completed no pass and says so rather than
    // reporting a zero that reads as a measurement.
    expect(body["latest_pass"]).toBeNull();
    expect(body["hosts_on_register"]).toBe(0);
  });
});
