const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export async function generateTotp(secret: string, timestamp = Date.now()): Promise<string> {
  const decoded = decodeBase32(secret);
  const keyBuffer = new ArrayBuffer(decoded.byteLength);
  new Uint8Array(keyBuffer).set(decoded);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const counter = Math.floor(timestamp / 1000 / 30);
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(4, counter);

  const hash = new Uint8Array(await crypto.subtle.sign("HMAC", key, buffer));
  const offset = (hash.at(-1) ?? 0) & 0x0f;
  const first = hash[offset] ?? 0;
  const second = hash[offset + 1] ?? 0;
  const third = hash[offset + 2] ?? 0;
  const fourth = hash[offset + 3] ?? 0;
  const code =
    (((first & 0x7f) << 24) |
      ((second & 0xff) << 16) |
      ((third & 0xff) << 8) |
      (fourth & 0xff)) %
    1_000_000;

  return code.toString().padStart(6, "0");
}

function decodeBase32(value: string): Uint8Array {
  const clean = value.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = "";
  for (const character of clean) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) {
      throw new Error("INVALID_TOTP_SECRET");
    }
    bits += index.toString(2).padStart(5, "0");
  }

  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return new Uint8Array(bytes);
}
