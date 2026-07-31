#!/usr/bin/env node
/**
 * THE STDIO BRIDGE — how a client that only speaks stdio reaches a
 * store that only speaks HTTP.
 *
 * This store's MCP server is REMOTE. It is a Cloudflare Worker at
 * https://scvd.store/mcp, it is already running, and there is nothing
 * to install: any client that speaks streamable HTTP can point at that
 * URL today and be done. This file exists for the clients that cannot.
 * A large share of MCP hosts still launch servers as local
 * subprocesses and talk newline-delimited JSON-RPC over stdin/stdout,
 * and for those the store was simply unreachable.
 *
 * SO IT IS A BRIDGE AND NOT A COPY OF THE STORE, and the distinction
 * is the whole design. It holds no key, needs no secret, keeps no
 * state, and cannot sign anything. Every request is forwarded to the
 * live store and every answer comes back from there, which means a
 * certificate you get through this bridge is the same artifact, from
 * the same key, verifiable at the same URL as one bought any other
 * way. A container that ran its own copy of the store with dummy
 * secrets would be a different shop wearing this one's name, and its
 * signatures would verify against nothing.
 *
 * WHY IT EXISTS AT ALL, honestly: Glama grades a server without a
 * deployable release, and its release flow runs security checks on the
 * built image. This store is short of exactly that kind of signal —
 * an outside reader recently could find no independent verification of
 * us — so a check somebody else runs is worth having. The bridge is
 * the only honest thing to put in a container: no secrets, no
 * pretending, and it genuinely does something a user wants.
 *
 * NO DEPENDENCIES, DELIBERATELY. Node 18+ has fetch built in. A
 * bridge whose supply chain is empty is a bridge nobody has to audit,
 * which matters more than usual for a file whose whole purpose is
 * running on somebody else's machine.
 */

const ENDPOINT = process.env.SCVD_MCP_ENDPOINT ?? "https://scvd.store/mcp";

/**
 * STDOUT CARRIES PROTOCOL AND NOTHING ELSE. A stray console.log here
 * is not a cosmetic problem — it lands in the middle of the client's
 * JSON-RPC stream and breaks the session. Diagnostics go to stderr,
 * which the host shows the user and the parser never sees.
 */
function note(message) {
  process.stderr.write(`[scvd-bridge] ${message}\n`);
}

/**
 * Forward one message and return what the store said, or null when
 * nothing should be written back.
 *
 * NOTIFICATIONS GET NO REPLY, EVER. A JSON-RPC message with no `id`
 * is a notification, and answering one is a protocol violation that
 * some hosts treat as a fatal error. The store may still return a body
 * for one; it is dropped here rather than forwarded.
 */
async function forward(message) {
  const isNotification = message.id === undefined || message.id === null;
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-SCVD-Channel": "mcp",
      },
      body: JSON.stringify(message),
    });
  } catch (error) {
    note(`could not reach ${ENDPOINT}: ${error}`);
    if (isNotification) {
      return null;
    }
    /**
     * A TRANSPORT FAILURE IS REPORTED AS ONE. Swallowing it would hang
     * the client forever waiting on an id that is never coming, which
     * is a worse failure than an error it can read and act on.
     */
    return {
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: -32603,
        message: `The store could not be reached at ${ENDPOINT}. This bridge holds nothing locally, so there is no cached answer to give you: ${String(error)}`,
      },
    };
  }

  const text = await response.text();
  if (isNotification) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    note(`the store answered ${response.status} with something that is not JSON`);
    return {
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: -32603,
        message: `The store answered HTTP ${response.status} with a body this bridge could not parse as JSON-RPC.`,
      },
    };
  }
}

function write(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

/**
 * NEWLINE-DELIMITED, BUFFERED ACROSS CHUNKS. stdin arrives in
 * arbitrary pieces: one read can hold half a message, or three
 * messages and a fragment of a fourth. Parsing each chunk as it lands
 * works right up until a message is large enough to be split, and then
 * fails in a way that looks like the store being broken.
 */
let buffer = "";

/**
 * IN-FLIGHT REQUESTS, TRACKED SO THE PROCESS DOES NOT OUTRUN THEM.
 *
 * The first cut exited the moment stdin closed, which raced every
 * pending fetch and produced a bridge that answered NOTHING — caught
 * by actually running it against a mock rather than by reading it,
 * which is the only reason it is not in the container. A host that
 * writes its requests and closes the pipe is doing something entirely
 * ordinary, and it would have got silence.
 */
const inFlight = new Set();

function track(promise) {
  inFlight.add(promise);
  promise.finally(() => inFlight.delete(promise));
  return promise;
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline = buffer.indexOf("\n");
  while (newline !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    newline = buffer.indexOf("\n");
    if (!line) {
      continue;
    }
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      note("dropped a line from the host that was not valid JSON");
      continue;
    }
    // Deliberately not awaited: a host may pipeline requests, and
    // serialising them here would make the bridge slower than the
    // store it fronts for no benefit. JSON-RPC ids do the matching.
    track(
      forward(message)
        .then((reply) => {
          if (reply !== null) {
            write(reply);
          }
        })
        .catch((error) => note(`unhandled: ${error}`)),
    );
  }
});

process.stdin.on("end", async () => {
  // Drain rather than exit. Requests settled while draining can queue
  // more work, so this loops until the set is genuinely empty.
  while (inFlight.size > 0) {
    await Promise.allSettled([...inFlight]);
  }
  process.exit(0);
});

note(`bridging stdio to ${ENDPOINT} — no key, no secret, no local state`);
