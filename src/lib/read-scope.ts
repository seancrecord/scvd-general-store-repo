import { AsyncLocalStorage } from "node:async_hooks";

const scopes = new AsyncLocalStorage<Map<object, WeakMap<object, Promise<unknown>>>>();

/** Share read-only inputs within one operation, never I/O between requests. */
export function withReadScope<T>(read: () => Promise<T>): Promise<T> {
  return scopes.run(new Map(), read);
}

/**
 * The reader's identity and its object argument identify the read. A failed
 * read fails every consumer in this operation; the next operation tries anew.
 * Outside an explicit scope this has exactly the uncached reader's behavior.
 */
export function readOnceInScope<K extends object, V>(
  read: (key: K) => Promise<V>,
): (key: K) => Promise<V> {
  return (key) => {
    const scope = scopes.getStore();
    if (!scope) return read(key);
    let values = scope.get(read);
    if (!values) {
      values = new WeakMap();
      scope.set(read, values);
    }
    let pending = values.get(key);
    if (!pending) {
      pending = read(key);
      values.set(key, pending);
    }
    // Only this reader can insert into its map, so its value type is V.
    return pending as Promise<V>;
  };
}
