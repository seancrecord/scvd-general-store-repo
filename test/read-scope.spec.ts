import { describe, expect, it, vi } from "vitest";
import { readOnceInScope, withReadScope } from "@/lib/read-scope";

describe("operation-local reads", () => {
  it("coalesces one reader and key, while keeping overlapping scopes and keys apart", async () => {
    const source = vi.fn(async (key: { value: number }) => ({ value: key.value }));
    const read = readOnceInScope(source);
    const one = { value: 1 };
    const two = { value: 2 };
    const [a, b] = await Promise.all([1, 2].map(() => withReadScope(async () => {
      const [first, same, other] = await Promise.all([read(one), read(one), read(two)]);
      expect(first).toBe(same);
      expect(other).not.toBe(first);
      return first;
    })));
    expect(source).toHaveBeenCalledTimes(4);
    expect(a).not.toBe(b);
  });

  it("does not retain failures into the next operation or cache unscoped calls", async () => {
    const source = vi.fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue(42);
    const read = readOnceInScope(source);
    const key = {};
    await withReadScope(async () => {
      const results = await Promise.allSettled([read(key), read(key)]);
      expect(results.map(r => r.status)).toEqual(["rejected", "rejected"]);
      expect(source).toHaveBeenCalledTimes(1);
    });
    expect(await withReadScope(() => read(key))).toBe(42);
    await Promise.all([read(key), read(key)]);
    expect(source).toHaveBeenCalledTimes(4);
  });
});
