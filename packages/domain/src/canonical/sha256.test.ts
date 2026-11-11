import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex, utf8Encode, utf8EncodeFallback } from './sha256';

/**
 * Reference SHA-256 computation using Node.js built-in crypto module.
 * Used exclusively within unit tests for differential cryptographic verification.
 */
function nodeSha256(input: string | Uint8Array): string {
  const hash = createHash('sha256');
  if (typeof input === 'string') {
    hash.update(input, 'utf8');
  } else {
    hash.update(input);
  }
  return hash.digest('hex');
}

describe('Pure TypeScript SHA-256 (NIST Verification & Differential Cryptographic Testing)', () => {
  describe('NIST FIPS 180-4 Test Vectors', () => {
    it('matches NIST test vector 1: Empty string', () => {
      const result = sha256Hex('');
      expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      expect(result).toBe(nodeSha256(''));
    });

    it('matches NIST test vector 2: "abc"', () => {
      const result = sha256Hex('abc');
      expect(result).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
      expect(result).toBe(nodeSha256('abc'));
    });

    it('matches NIST test vector 3: 448-bit message across block boundary', () => {
      const input = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
      const result = sha256Hex(input);
      expect(result).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
      expect(result).toBe(nodeSha256(input));
    });
  });

  describe('Differential Verification against node:crypto', () => {
    it('matches node:crypto for standard ASCII texts', () => {
      const samples = [
        'The quick brown fox jumps over the lazy dog',
        'The quick brown fox jumps over the lazy cog',
        'Nimphy decision intelligence for publishing business-cases',
        'ADR-005: Money representation and rounding mode',
      ];
      for (const sample of samples) {
        expect(sha256Hex(sample)).toBe(nodeSha256(sample));
      }
    });

    it('matches node:crypto for Unicode text and currency symbols', () => {
      const currencySamples = [
        'USD $19.99',
        'EUR €25.50',
        'GBP £14.00',
        'JPY ¥2500',
        'CAD CA$29.99',
        'AUD A$32.50',
        'Multi-currency string: $ € £ ¥ CA$ A$',
      ];
      for (const sample of currencySamples) {
        expect(sha256Hex(sample)).toBe(nodeSha256(sample));
      }
    });

    it('matches node:crypto for supplementary-plane Unicode characters (emojis, symbols)', () => {
      const supplementarySamples = [
        '😀 🚀 🎉 📚',
        'Musical symbol G clef: \uD834\uDD1E',
        'Mixed text with emojis: Book 📖 by Author ✍️ sold for $19.99 💰',
        'Mathematical bold characters: 𝐀𝐁𝐂𝐃',
      ];
      for (const sample of supplementarySamples) {
        expect(sha256Hex(sample)).toBe(nodeSha256(sample));
      }
    });

    it('matches node:crypto at critical padding boundaries: 55, 56, 63, 64, 65 bytes', () => {
      const boundaries = [55, 56, 63, 64, 65];
      for (const len of boundaries) {
        const payload = 'A'.repeat(len);
        expect(sha256Hex(payload)).toBe(nodeSha256(payload));
      }
    });

    it('matches node:crypto at two-block padding boundaries: 127, 128, 129 bytes', () => {
      const boundaries = [127, 128, 129];
      for (const len of boundaries) {
        const payload = 'B'.repeat(len);
        expect(sha256Hex(payload)).toBe(nodeSha256(payload));
      }
    });

    it('matches node:crypto for larger practical payloads across many 512-bit blocks', () => {
      const sizes = [1024, 10000, 65536];
      for (const size of sizes) {
        // Deterministic repeating pattern
        const payload = '0123456789abcdef'.repeat(size / 16);
        expect(sha256Hex(payload)).toBe(nodeSha256(payload));
      }
    });

    it('accepts Uint8Array input directly matching string input and node:crypto', () => {
      const text = 'test message for byte-level verification';
      const encoded = new TextEncoder().encode(text);

      const fromString = sha256Hex(text);
      const fromBytes = sha256Hex(encoded);
      const fromNode = nodeSha256(encoded);

      expect(fromBytes).toBe(fromString);
      expect(fromBytes).toBe(fromNode);
    });
  });

  describe('Fallback UTF-8 Encoder Verification', () => {
    it('produces identical byte sequences to TextEncoder for standard ASCII and Unicode', () => {
      const testCases = [
        'hello world',
        'USD $19.99',
        'EUR €25.50',
        'GBP £14.00',
        'JPY ¥2500',
        '😀 🚀',
        '\uD834\uDD1E',
      ];

      for (const text of testCases) {
        const standard = new TextEncoder().encode(text);
        const fallback = utf8EncodeFallback(text);
        expect(Array.from(fallback)).toEqual(Array.from(standard));
        expect(sha256Hex(fallback)).toBe(nodeSha256(text));
      }
    });

    it('conforms to WHATWG/RFC 3629 replacement semantics for unpaired surrogates', () => {
      // Unpaired high surrogate
      const unpairedHigh = '\uD800';
      const standardHigh = new TextEncoder().encode(unpairedHigh);
      const fallbackHigh = utf8EncodeFallback(unpairedHigh);
      expect(Array.from(fallbackHigh)).toEqual(Array.from(standardHigh));
      // Standard replacement character U+FFFD is encoded as [0xef, 0xbf, 0xbd]
      expect(Array.from(fallbackHigh)).toEqual([0xef, 0xbf, 0xbd]);

      // Unpaired low surrogate
      const unpairedLow = '\uDC00';
      const standardLow = new TextEncoder().encode(unpairedLow);
      const fallbackLow = utf8EncodeFallback(unpairedLow);
      expect(Array.from(fallbackLow)).toEqual(Array.from(standardLow));
      expect(Array.from(fallbackLow)).toEqual([0xef, 0xbf, 0xbd]);

      // Unpaired high surrogate followed by regular character
      const highFollowedByChar = '\uD800hello';
      const standardHighChar = new TextEncoder().encode(highFollowedByChar);
      const fallbackHighChar = utf8EncodeFallback(highFollowedByChar);
      expect(Array.from(fallbackHighChar)).toEqual(Array.from(standardHighChar));

      // Two consecutive high surrogates
      const twoHighs = '\uD800\uD800';
      const standardTwoHighs = new TextEncoder().encode(twoHighs);
      const fallbackTwoHighs = utf8EncodeFallback(twoHighs);
      expect(Array.from(fallbackTwoHighs)).toEqual(Array.from(standardTwoHighs));
    });

    it('utf8Encode delegates to TextEncoder or fallback correctly', () => {
      const text = 'test utf8Encode delegation';
      const result = utf8Encode(text);
      expect(ArrayBuffer.isView(result)).toBe(true);
      expect(result.constructor.name).toBe('Uint8Array');
      expect(Array.from(result)).toEqual(Array.from(new TextEncoder().encode(text)));
    });

    it('falls back to pure fallback when TextEncoder is undefined in runtime', () => {
      const orig = globalThis.TextEncoder;
      try {
        // @ts-expect-error simulating runtime without TextEncoder
        globalThis.TextEncoder = undefined;
        const text = 'test fallback path';
        const result = utf8Encode(text);
        expect(Array.from(result)).toEqual(Array.from(utf8EncodeFallback(text)));
      } finally {
        globalThis.TextEncoder = orig;
      }
    });
  });
});
