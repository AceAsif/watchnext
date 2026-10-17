// Minimal .zip reader for the Letterboxd export — no dependency. Reads the
// central directory and inflates "deflate" entries with the browser's built-in
// DecompressionStream. Only the CSV files we care about are extracted.

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// buf: ArrayBuffer | Uint8Array. wanted(name) -> bool. Returns [{name, text}].
export async function readZipTexts(buf, wanted = () => true) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('That file is not a zip.');
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const dec = new TextDecoder('utf-8');
  const out = [];
  for (let i = 0; i < count; i++) {
    if (u32(b, p) !== 0x02014b50) throw new Error('The zip file looks damaged.');
    const method = u16(b, p + 10);
    const csize = u32(b, p + 20);
    const nlen = u16(b, p + 28);
    const elen = u16(b, p + 30);
    const clen = u16(b, p + 32);
    const local = u32(b, p + 42);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (name.endsWith('/') || !wanted(name)) continue;
    const lnlen = u16(b, local + 26);
    const lelen = u16(b, local + 28);
    const start = local + 30 + lnlen + lelen;
    const raw = b.subarray(start, start + csize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = await inflateRaw(raw);
    else throw new Error('That zip uses a compression this app cannot read.');
    out.push({ name, text: dec.decode(data) });
  }
  return out;
}

// The Letterboxd CSVs we use, at the top level of the zip (not deleted/, likes/, lists/).
export const isLetterboxdCsv = (name) => /^(?:[^/]+\/)?(watched|diary|ratings|watchlist)\.csv$/i.test(name) && !/(^|\/)(deleted|orphaned|likes|lists)\//i.test(name);
