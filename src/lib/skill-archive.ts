/** A deterministic tar.gz for the small, explicitly published text bundle.
 * No filesystem, timestamps, links or extra files enter the archive. */
export async function skillArchive(files: Readonly<Record<string, string>>): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const entries = Object.entries(files).map(([name, text]) => {
    const path = encoder.encode(name);
    if (!/^[a-zA-Z0-9_./-]+$/.test(name) || name.startsWith("/") ||
      name.split("/").some(part => !part || part === "." || part === "..") || path.length > 100) {
      throw new Error("Invalid published skill path");
    }
    return { path, body: encoder.encode(text) };
  });
  const tar = new Uint8Array(entries.reduce((size, { body }) => size + 512 + Math.ceil(body.length / 512) * 512, 1024));
  let offset = 0;
  for (const { path, body } of entries) {
    const header = tar.subarray(offset, offset + 512);
    const field = (at: number, width: number, value: number) => {
      const octal = value.toString(8);
      if (octal.length >= width) throw new Error("Published skill archive is too large");
      header.set(encoder.encode(octal.padStart(width - 1, "0") + "\0"), at);
    };
    header.set(path);
    field(100, 8, 0o644);
    field(108, 8, 0);
    field(116, 8, 0);
    field(124, 12, body.length);
    field(136, 12, 0); // fixed mtime: the digest describes content, not request time
    header.fill(32, 148, 156);
    header[156] = 48;
    header.set(encoder.encode("ustar\0"), 257);
    header.set(encoder.encode("00"), 263);
    field(148, 7, header.reduce((sum, byte) => sum + byte, 0));
    header[155] = 32;
    offset += 512;
    tar.set(body, offset);
    offset += Math.ceil(body.length / 512) * 512;
  }
  const stream = new Blob([tar]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
