/** Concrete paid resources for the free validator; no payments are made here. */
export function validationResources(menu, document, base = "https://scvd.store") {
  if (!Array.isArray(menu?.items) || !menu.items.length) throw new Error("Menu contained no items; nothing was checked.");
  const rows = menu.items.map(item => {
    if (typeof item.id !== "string" || !/^[a-z0-9_]+$/.test(item.id)) throw new Error("Menu contained an invalid item id.");
    return { id: item.id, url: `${base}/api/buy/${item.id}` };
  });
  if (!document?.paths || typeof document.paths !== "object" || Array.isArray(document.paths) || !Object.keys(document.paths).length) {
    throw new Error("OpenAPI contained no readable paths; publication coverage is unknown.");
  }
  const seen = new Set(rows.map(row => row.url));
  for (const [path, methods] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(methods ?? {})) {
      if (!operation?.["x-payment"]) continue;
      if (method !== "get") throw new Error(`Paid ${method} ${path} needs a safe validation request; coverage is incomplete.`);
      if (!path.startsWith("/") || /[{}?#\\]/.test(path)) throw new Error(`Paid path is not concrete: ${path}`);
      const url = new URL(path, base);
      if (url.origin !== new URL(base).origin) throw new Error(`Paid path changes origin: ${path}`);
      if (!seen.has(url.href)) {
        rows.push({ id: path, url: url.href });
        seen.add(url.href);
      }
    }
  }
  return rows;
}
