import { describe, expect, it } from "vitest";
import { jcsCanonicalize } from "@/lib/jcs";

describe("JCS input boundaries", () => {
  it("preserves sparse array positions as JSON nulls", () => {
    expect(jcsCanonicalize([1, , 3])).toBe("[1,null,3]");
    expect(jcsCanonicalize(Array(2))).toBe("[null,null]");
  });
  it.each([new Date("2026-10-07T00:00:00Z"), new Number(7), new Boolean(true), new String("hi"), new Map(), new Set()])("refuses native objects rather than signing missing data: %s", (value) => {
    expect(() => jcsCanonicalize({ value })).toThrow(/plain JSON/);
  });
  it.each(["\ud800", "\udfff", "a\ud800b"])("rejects invalid Unicode in values and property names", (value) => {
    expect(() => jcsCanonicalize(JSON.parse(JSON.stringify(value)))).toThrow(/Unicode/);
    expect(() => jcsCanonicalize({ [value]: "value" })).toThrow(/Unicode/);
  });
  it("preserves valid astral text, shared references and null-prototype records", () => {
    const value = Object.assign(Object.create(null), { text: "😀" });
    expect(jcsCanonicalize([value, value])).toBe('[{"text":"😀"},{"text":"😀"}]');
  });
  it("refuses cycles explicitly", () => {
    const value: { self?: unknown } = {}; value.self = value;
    expect(() => jcsCanonicalize(value)).toThrow(/cyclic/);
  });
});
