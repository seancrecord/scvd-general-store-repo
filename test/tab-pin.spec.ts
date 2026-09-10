import { describe, expect, it } from "vitest";
import tabPackage from "../tab/package.json";
import mcpManifest from "../mcp.json";
import pluginSkill from "../skills/scvd-general-store/SKILL.md?raw";
import clawhubBundle from "../registry/clawhub/SKILL.md?raw";
import tabReadme from "../tab/README.md?raw";

/**
 * THE TAB IS INSTALLED BY VERSION, NOT BY NAME.
 *
 * A ClawHub security audit on 2026-09-10 (Tencent A.I.G, finding T08)
 * read the skill's install block — `npx -y scvd-tab` — and said the
 * true thing about it: a name resolves to whatever the registry
 * serves at launch, `-y` skips the prompt, and so the code that runs
 * on a builder's machine could differ from the code reviewed when the
 * skill was published. The fix is a pin, `scvd-tab@<version>`, in
 * every install block that leaves the building.
 *
 * A pin is a typed number, and typed numbers drift: the next `npm
 * publish` of the tab makes every pinned block point at the previous
 * release. This file is the guard. tab/package.json is the truth the
 * publish reads, so it is the truth the pins are checked against.
 * Bumping the tab means bumping the pins, and this test says so
 * rather than letting a stale pin ship under a fresh skill version.
 */
const VERSION = tabPackage.version;

/** Every `npx` mention of the tab, pinned or not, with what it pinned to. */
function tabPins(document: string): string[] {
  return [...document.matchAll(/scvd-tab(?:-pager)?(@[^\s"'`\]]+)?/g)]
    .filter((match) => !/scvd-tab-pager/.test(match[0]) || match[1])
    .map((match) => match[1] ?? "");
}

describe("every install block pins the tab to the version in tab/package.json", () => {
  it("mcp.json pins it", () => {
    const tab = mcpManifest.mcpServers["scvd-tab"];
    expect(tab.command).toBe("npx");
    expect(tab.args).toEqual(["-y", `scvd-tab@${VERSION}`]);
  });

  for (const [label, document] of [
    ["the plugin skill", pluginSkill],
    ["the ClawHub bundle", clawhubBundle],
    ["tab/README.md", tabReadme],
  ] as const) {
    it(`${label} pins every npx install line`, () => {
      const lines = document
        .split("\n")
        .filter((line) => /npx|"args"/.test(line) && /scvd-tab/.test(line));
      expect(lines.length, `${label} names no install line at all`).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line, `unpinned tab install in ${label}: ${line}`).toContain(`scvd-tab@${VERSION}`);
      }
    });

    it(`${label} never pins a version the tab is not`, () => {
      const stale = tabPins(document).filter((pin) => pin && pin !== `@${VERSION}`);
      expect(stale, `${label} pins a version tab/package.json does not carry`).toEqual([]);
    });
  }
});
