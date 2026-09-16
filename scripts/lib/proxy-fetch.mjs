/**
 * MAKE fetch() HONOUR HTTPS_PROXY.
 *
 * Node's global fetch ignores the proxy environment variables that curl
 * and git obey. In a sandbox that reaches the network only through a
 * proxy, that difference is invisible until it is expensive: curl
 * reaches a host, the same URL from a script comes back 403 with a body
 * that says the host is not allowlisted, and the obvious reading —
 * "the host is blocked" — is wrong. It cost a wrong answer to a
 * counterparty here on 2026-09-16: an Arbitrum RPC that curl could
 * reach was about to be reported as unreachable.
 *
 * Call this once at the top of any script that fetches. It is a no-op
 * when no proxy is configured, so it changes nothing outside a sandbox.
 */
let installed = false;

export async function useEnvProxy() {
  if (installed) return null;
  installed = true;
  const proxy =
    process.env.HTTPS_PROXY ?? process.env.https_proxy ??
    process.env.HTTP_PROXY ?? process.env.http_proxy ?? null;
  if (!proxy) return null;
  try {
    const { ProxyAgent, setGlobalDispatcher } = await import("undici");
    setGlobalDispatcher(new ProxyAgent(proxy));
    return proxy;
  } catch (error) {
    // Undici absent is not fatal: fetch still works for anything the
    // sandbox allows directly. Say so rather than failing silently,
    // because the symptom otherwise looks like a blocked host.
    console.error(`! HTTPS_PROXY is set (${proxy}) but undici could not be loaded (${error?.code ?? error}); fetch will go direct and some hosts may read as unreachable when they are not`);
    return null;
  }
}
