/**
 * Standalone, deterministic SHA-256 (FIPS 180-4) implementation in pure TypeScript.
 * Zero external dependencies; zero Node-specific I/O or native bindings.
 * Operates purely in memory across all standard JavaScript runtimes.
 */

// Initial hash values (first 32 bits of the fractional parts of the square roots of the first 8 primes 2..19)
const H_INIT: readonly [number, number, number, number, number, number, number, number] =
  Object.freeze([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

// Round constants (first 32 bits of the fractional parts of the cube roots of the first 64 primes 2..311)
const K: readonly number[] = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/**
 * Pure fallback UTF-8 encoder adhering to WHATWG / RFC 3629 standard.
 * Emits standard replacement sequence for U+FFFD (0xef, 0xbf, 0xbd) for unpaired surrogates.
 */
export function utf8EncodeFallback(str: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const codePoint = str.charCodeAt(i);
    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0xd800 || codePoint > 0xdfff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
      // High surrogate: check if followed by valid low surrogate
      if (i + 1 < str.length) {
        const next = str.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          i++;
          const fullCodePoint = 0x10000 + (((codePoint & 0x3ff) << 10) | (next & 0x3ff));
          bytes.push(
            0xf0 | (fullCodePoint >> 18),
            0x80 | ((fullCodePoint >> 12) & 0x3f),
            0x80 | ((fullCodePoint >> 6) & 0x3f),
            0x80 | (fullCodePoint & 0x3f),
          );
          continue;
        }
      }
      // Unpaired high surrogate -> U+FFFD
      bytes.push(0xef, 0xbf, 0xbd);
    } else {
      // Unpaired low surrogate (0xdc00..0xdfff) -> U+FFFD
      bytes.push(0xef, 0xbf, 0xbd);
    }
  }
  return new Uint8Array(bytes);
}

/**
 * Encodes a string into UTF-8 byte array using standard TextEncoder or pure fallback.
 */
export function utf8Encode(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  return utf8EncodeFallback(str);
}

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/**
 * Computes the SHA-256 hash of a string or byte array and returns a 64-character lowercase hex string.
 */
export function sha256Hex(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? utf8Encode(input) : input;
  const byteLen = bytes.length;
  const bitLen = byteLen * 8;

  // Pre-processing: padding
  // message + 0x80 + zeroes + 64-bit length
  const extraLen = byteLen % 64 < 56 ? 56 - (byteLen % 64) : 120 - (byteLen % 64);
  const totalLen = byteLen + extraLen + 8;
  const padded = new Uint8Array(totalLen);
  padded.set(bytes);
  padded[byteLen] = 0x80;

  // Append length in bits as 64-bit big-endian integer
  const view = new DataView(padded.buffer);
  // High 32 bits (bits beyond 2^32)
  const highBits = Math.floor(bitLen / 0x100000000);
  const lowBits = bitLen >>> 0;
  view.setUint32(totalLen - 8, highBits, false);
  view.setUint32(totalLen - 4, lowBits, false);

  // Hash state variables
  let h0 = H_INIT[0];
  let h1 = H_INIT[1];
  let h2 = H_INIT[2];
  let h3 = H_INIT[3];
  let h4 = H_INIT[4];
  let h5 = H_INIT[5];
  let h6 = H_INIT[6];
  let h7 = H_INIT[7];

  const w = new Int32Array(64);

  // Process each 512-bit (64-byte) block
  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getInt32(offset + i * 4, false);
    }

    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i]! + w[i]!) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  // Format the eight 32-bit words into 64-char hex string
  function hex32(num: number): string {
    return (num >>> 0).toString(16).padStart(8, '0');
  }

  return (
    hex32(h0) + hex32(h1) + hex32(h2) + hex32(h3) + hex32(h4) + hex32(h5) + hex32(h6) + hex32(h7)
  );
}
