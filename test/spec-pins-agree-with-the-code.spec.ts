import { describe, expect, it } from "vitest";
import { SPEC_SCHEMES } from "@/services/preflight";
import lock from "../research/protocol-screen/spec-pins.lock.json";

/**
 * THE PIN SAYS THE SOURCE HAS NOT MOVED. IT NEVER SAID WE READ IT
 * RIGHT — AND ONE OF THESE CLAIMS IS AN ACCUSATION.
 *
 * spec-pins is a FRESHNESS check, and its own header is explicit that
 * this is a stated non-goal rather than an oversight: "A clean run is
 * not a correct citation. It proves the source is unchanged since the
 * pinned read, not that our reading of it was right. The August scheme
 * advisory would have passed every freshness check ever written,
 * because the mistake was in the reading, not in the source."
 *
 * That August advisory is why this file exists. `SPEC_SCHEMES` is a
 * hand-written Set of four strings, and `preflight.ts` says of it:
 * "publishes the misjudgement over our signature. When this list falls
 * behind the specification again, that is a defect in us." It is not
 * decoration — the `nonstandard-scheme` advisory interpolates the set
 * into signed prose about somebody else's door, naming this store's
 * own list as the authority for calling their scheme non-standard. A
 * fifth family shipping means the store signs an accusation against a
 * conforming door and cites an incomplete list while doing it. Six
 * weeks of exactly that is the defect spec-pins was built after.
 *
 * NOTHING NEEDED VENDORING. The lock already records the pinned tree's
 * own path listing, and the specification publishes one directory per
 * scheme family, so the published set is derivable from evidence
 * already in this repository. What was missing was anything joining it
 * to the constant.
 *
 * WHAT THIS DOES NOT DO, said as plainly as the header above says its
 * own limits: it compares a list to a directory listing. A family
 * whose specification reverses a MUST looks identical here to one that
 * fixed a typo. This catches the family that APPEARS and the family
 * that GOES, which is the shape the August defect actually had.
 */

interface Pin {
  digest: string;
  read_date: string;
  files: number;
  lines: string[];
}

const pins = lock.pins as unknown as Record<string, Pin>;

/**
 * The paths a pin recorded, without their blob hashes. The lock writes
 * `<blob> <path>`, and a path may contain spaces, so the split is at
 * the FIRST space only.
 */
function pathsOf(pin: Pin): string[] {
  return pin.lines.map((line) => line.slice(line.indexOf(" ") + 1));
}

/**
 * The names published directly under the directory a pin watches.
 *
 * The directory is passed in rather than inferred, and that was a
 * correction: inferring it from the longest common run of segments
 * reads correctly for a listing of many files and WRONGLY for a
 * listing of one, where there is no commonality to measure and the
 * filename looks like the name. A pin that shrank to a single family
 * would then have reported that family as its own filename and this
 * comparison would have passed on nonsense.
 *
 * So the caller states the directory — it is the pin's own `paths`
 * entry in scripts/lib/spec-pins.mjs — and every row is held to it.
 * A layout that moves upstream fails here loudly instead of deriving
 * a plausible wrong answer.
 */
function publishedNames(pin: Pin, watched: string): Set<string> {
  const paths = pathsOf(pin);
  const astray = paths.filter((path) => !path.startsWith(watched));
  if (astray.length > 0) {
    throw new Error(
      `${astray.length} of ${paths.length} pinned paths are not under ${watched} (first: ${astray[0]}). The upstream layout moved; this pin's watched directory in scripts/lib/spec-pins.mjs and the reading below both need a human.`,
    );
  }
  return new Set(
    paths
      .map((path) => path.slice(watched.length).split("/")[0])
      .filter((name): name is string => Boolean(name)),
  );
}

describe("a pinned claim about somebody else's specification agrees with the code making it", () => {
  it("lists exactly the scheme families the x402 specification publishes", () => {
    const pin = pins["x402-scheme-families"]!;
    // The lock is evidence; a listing that lost rows would weaken this
    // comparison silently, so its own count is checked first.
    expect(pin.lines.length).toBe(pin.files);

    expect(
      [...publishedNames(pin, "specs/schemes/")].sort(),
      "SPEC_SCHEMES and specs/schemes/ disagree. A family this store does not list is a door it will sign an accusation against for implementing the specification; a family it lists that no longer exists is an advisory nobody can trigger. Reconcile preflight.ts with the re-pinned listing — that is what this pin's on_drift note asks a human to do, and it is the one thing --update cannot do for them.",
    ).toEqual([...SPEC_SCHEMES].sort());
  });

  it("would fire the day a fifth family is pinned, which is the whole point", () => {
    /*
     * The real lock cannot be edited to prove this — it is the record
     * of what a human read, not a fixture. So the derivation is shown
     * against a listing shaped exactly like the lock's, with a family
     * the constant does not know.
     */
    const withNewFamily: Pin = {
      digest: "sha256:not-a-real-digest",
      read_date: "2026-09-14",
      files: 3,
      lines: [
        "0000000000000000000000000000000000000000 specs/schemes/exact/scheme_exact.md",
        "1111111111111111111111111111111111111111 specs/schemes/upto/scheme_upto.md",
        "2222222222222222222222222222222222222222 specs/schemes/streaming/scheme_streaming.md",
      ],
    };
    const published = publishedNames(withNewFamily, "specs/schemes/");
    expect([...published].sort()).toEqual(["exact", "streaming", "upto"]);
    expect(published.has("streaming")).toBe(true);
    expect(SPEC_SCHEMES.has("streaming"), "the constant does not know it, which is the failure this guard reports").toBe(false);

    // And a family that DISAPPEARS is caught by the same equality: the
    // derived set simply no longer contains it.
    // Including when the listing shrinks to one row, which is where
    // an inferred directory would have read the filename as the name.
    const shrunk: Pin = { ...withNewFamily, files: 1, lines: [withNewFamily.lines[0]!] };
    expect([...publishedNames(shrunk, "specs/schemes/")]).toEqual(["exact"]);
  });

  it("reads the other pinned listings the same way, and refuses one whose layout moved", () => {
    // The methods pin nests a directory per method family; the
    // extensions pin publishes one file each. Same derivation, both.
    expect([...publishedNames(pins["mpp-methods"]!, "specs/methods/")].sort()).toContain("lightning");
    expect(publishedNames(pins["x402-extensions"]!, "specs/extensions/").size).toBe(
      pins["x402-extensions"]!.files,
    );
    // And a watched directory the rows do not sit under is a refusal,
    // not a quietly empty set.
    expect(() => publishedNames(pins["mpp-methods"]!, "specs/schemes/")).toThrow(/layout moved/);
  });
});
