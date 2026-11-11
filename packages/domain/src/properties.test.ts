import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  InvalidMoneyError,
  InvalidProvenanceError,
  Money,
  MoneyOverflowError,
  PROVENANCE_VALUES,
  Provenance,
  assertProvenance,
  canonicalJson,
  createProvenanced,
  hashCanonicalJson,
  isProvenance,
  parseProvenance,
  sha256Hex,
  toCanonicalJson,
} from './index';

/**
 * Deterministic pseudo-random number generator (Mulberry32).
 * Seeded to ensure 100% reproducible property-based testing without external dependencies.
 */
function createPrng(seed = 0xdeadbeef) {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(prng: () => number, min: number, max: number): number {
  return Math.floor(prng() * (max - min + 1)) + min;
}

function randomChoice<T>(prng: () => number, array: readonly T[]): T {
  return array[randomInt(prng, 0, array.length - 1)]!;
}

function randomString(
  prng: () => number,
  minLen: number,
  maxLen: number,
  alphabet: string,
): string {
  const len = randomInt(prng, minLen, maxLen);
  let res = '';
  for (let i = 0; i < len; i++) {
    res += alphabet[randomInt(prng, 0, alphabet.length - 1)];
  }
  return res;
}

function randomBytes(prng: () => number, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = randomInt(prng, 0, 255);
  }
  return bytes;
}

function shuffle<T>(prng: () => number, array: readonly T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(prng, 0, i);
    const temp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = temp;
  }
  return copy;
}

function nodeSha256(input: string | Uint8Array): string {
  const hash = createHash('sha256');
  if (typeof input === 'string') {
    hash.update(input, 'utf8');
  } else {
    hash.update(input);
  }
  return hash.digest('hex');
}

describe('Domain Property-Based & Invariant Test Suite', () => {
  describe('Property 1: Money Addition/Subtraction Consistency & Invariants', () => {
    it('satisfies commutativity, identity, inverse, and round-trip consistency across generated integer ranges', () => {
      const prng = createPrng(1001);
      const testCasesCount = 200;

      // Safe minor unit range where addition and subtraction of pairs cannot overflow MAX_SAFE_INTEGER
      const SAFE_BOUND = 10_000_000_000_000; // 10^13 (MAX_SAFE_INTEGER is ~9 * 10^15)

      for (let i = 0; i < testCasesCount; i++) {
        const aVal = randomInt(prng, -SAFE_BOUND, SAFE_BOUND);
        const bVal = randomInt(prng, -SAFE_BOUND, SAFE_BOUND);

        const a = Money.of(aVal, 'USD');
        const b = Money.of(bVal, 'USD');
        const zero = Money.zero('USD');

        // Commutativity: a + b === b + a
        const sumAB = a.add(b);
        const sumBA = b.add(a);
        expect(sumAB.equals(sumBA)).toBe(true);
        expect(sumAB.amountMinor).toBe(aVal + bVal);

        // Additive Identity: a + 0 === a and a - 0 === a
        expect(a.add(zero).equals(a)).toBe(true);
        expect(a.subtract(zero).equals(a)).toBe(true);

        // Additive Inverse: a + (-a) === 0 and a - a === 0
        expect(a.add(a.negate()).isZero()).toBe(true);
        expect(a.subtract(a).isZero()).toBe(true);

        // Consistency between addition and subtraction: (a + b) - b === a
        expect(sumAB.subtract(b).equals(a)).toBe(true);

        // Consistency between subtraction and addition: (a - b) + b === a
        const diffAB = a.subtract(b);
        expect(diffAB.add(b).equals(a)).toBe(true);
        expect(diffAB.amountMinor).toBe(aVal - bVal);

        // Double negation: -(-a) === a
        expect(a.negate().negate().equals(a)).toBe(true);
      }
    });

    it('satisfies associativity for generated triplets within safe bounds: (a + b) + c === a + (b + c)', () => {
      const prng = createPrng(1002);
      const testCasesCount = 100;
      const BOUND = 1_000_000_000_000; // 10^12

      for (let i = 0; i < testCasesCount; i++) {
        const a = Money.of(randomInt(prng, -BOUND, BOUND), 'EUR');
        const b = Money.of(randomInt(prng, -BOUND, BOUND), 'EUR');
        const c = Money.of(randomInt(prng, -BOUND, BOUND), 'EUR');

        const left = a.add(b).add(c);
        const right = a.add(b.add(c));
        expect(left.equals(right)).toBe(true);
      }
    });
  });

  describe('Property 2: Money Preserves Safe-Integer Constraints & Guards Against Overflow', () => {
    it('guarantees that every constructed Money holds a safe integer', () => {
      const prng = createPrng(2001);
      for (let i = 0; i < 200; i++) {
        const amount = randomInt(prng, -10_000_000, 10_000_000);
        const m = Money.of(amount, 'USD');
        expect(Number.isSafeInteger(m.amountMinor)).toBe(true);
        expect(m.amountMinor).toBe(Math.trunc(m.amountMinor));
      }
    });

    it('reliably detects and prevents overflow beyond MAX_SAFE_INTEGER and MIN_SAFE_INTEGER on boundary operations', () => {
      const prng = createPrng(2002);
      for (let i = 0; i < 50; i++) {
        const delta = randomInt(prng, 1, 1_000_000);

        // Max boundary overflow
        const max = Money.of(Number.MAX_SAFE_INTEGER, 'USD');
        const addDelta = Money.of(delta, 'USD');
        expect(() => max.add(addDelta)).toThrow(MoneyOverflowError);

        // Min boundary underflow
        const min = Money.of(Number.MIN_SAFE_INTEGER, 'USD');
        const subDelta = Money.of(delta, 'USD');
        expect(() => min.subtract(subDelta)).toThrow(MoneyOverflowError);
      }
    });

    it('rejects arbitrary non-integer floating-point multipliers with InvalidMoneyError', () => {
      const prng = createPrng(2003);
      for (let i = 0; i < 100; i++) {
        const intPart = randomInt(prng, -1000, 1000);
        // Ensure fractional part is non-zero
        const frac = randomInt(prng, 1, 9999) / 10000;
        const floatFactor = intPart >= 0 ? intPart + frac : intPart - frac;

        const m = Money.of(1000, 'USD');
        expect(() => m.multiply(floatFactor)).toThrow(InvalidMoneyError);
      }
    });

    it('rejects rational multiplications that produce fractional minor units without silent rounding', () => {
      const prng = createPrng(2004);
      for (let i = 0; i < 100; i++) {
        // Pick denominator > 1 and amount/numerator such that (amount * num) % den !== 0
        const den = randomInt(prng, 2, 50);
        const num = randomInt(prng, 1, 50);
        const amount = randomInt(prng, 1, 1000);

        if ((BigInt(amount) * BigInt(num)) % BigInt(den) !== 0n) {
          const m = Money.of(amount, 'USD');
          expect(() => m.multiplyRatio(num, den)).toThrow(InvalidMoneyError);
        }
      }
    });

    it('guards against safe-integer overflow during integer and rational multiplication', () => {
      const prng = createPrng(2005);
      for (let i = 0; i < 50; i++) {
        const factor = randomInt(prng, 2, 100);
        const hugeAmount = Math.floor(Number.MAX_SAFE_INTEGER / factor) + randomInt(prng, 1, 1000);

        const m = Money.of(hugeAmount, 'USD');
        expect(() => m.multiply(factor)).toThrow(MoneyOverflowError);
        expect(() => m.multiplyRatio(factor, 1)).toThrow(MoneyOverflowError);
      }
    });
  });

  describe('Property 3: Canonical JSON Determinism Across Permutations', () => {
    /**
     * Recursively permutes the keys of all objects in a JSON-compatible data structure.
     */
    function permuteKeys(val: unknown, prng: () => number): unknown {
      if (val === null || typeof val !== 'object') {
        return val;
      }

      if (Array.isArray(val)) {
        return val.map((item) => permuteKeys(item, prng));
      }

      const obj = val as Record<string, unknown>;
      const keys = Object.keys(obj);
      const shuffledKeys = shuffle(prng, keys);
      const permuted: Record<string, unknown> = {};
      for (const k of shuffledKeys) {
        permuted[k] = permuteKeys(obj[k], prng);
      }
      return permuted;
    }

    /**
     * Generates a random valid JSON-compatible structure with depth limit.
     */
    function generateRandomJson(prng: () => number, depth = 0): unknown {
      if (depth >= 3) {
        // Leaf values
        const leafType = randomChoice(prng, ['number', 'string', 'boolean', 'null']);
        if (leafType === 'number') return randomInt(prng, -10000, 10000);
        if (leafType === 'string')
          return randomString(prng, 0, 10, 'abcdefghijklmnopqrstuvwxyz0123456789_');
        if (leafType === 'boolean') return prng() > 0.5;
        return null;
      }

      const branchType = randomChoice(prng, ['object', 'array', 'leaf']);
      if (branchType === 'object') {
        const keyCount = randomInt(prng, 1, 5);
        const obj: Record<string, unknown> = {};
        for (let i = 0; i < keyCount; i++) {
          const key = `key_${String.fromCharCode(97 + i)}_${randomInt(prng, 1, 99)}`;
          obj[key] = generateRandomJson(prng, depth + 1);
        }
        return obj;
      }

      if (branchType === 'array') {
        const len = randomInt(prng, 0, 4);
        const arr: unknown[] = [];
        for (let i = 0; i < len; i++) {
          arr.push(generateRandomJson(prng, depth + 1));
        }
        return arr;
      }

      return randomInt(prng, -1000, 1000);
    }

    it('guarantees identical canonical JSON and hash Canonical JSON across 100 randomly permuted structures', () => {
      const prng = createPrng(3001);

      for (let i = 0; i < 100; i++) {
        const original = generateRandomJson(prng);
        const permuted = permuteKeys(original, prng);

        const canonicalOriginal = canonicalJson(original);
        const canonicalPermuted = canonicalJson(permuted);
        const toCanonicalOriginal = toCanonicalJson(original);

        // toCanonicalJson and canonicalJson alias are identical
        expect(canonicalOriginal).toBe(toCanonicalOriginal);

        // Permuted object yields strictly identical serialized string
        expect(canonicalOriginal).toBe(canonicalPermuted);

        // Hash of canonical JSON is strictly identical
        const hashOriginal = hashCanonicalJson(original);
        const hashPermuted = hashCanonicalJson(permuted);
        expect(hashOriginal).toBe(hashPermuted);
        expect(hashOriginal).toBe(`sha256:${sha256Hex(canonicalOriginal)}`);
      }
    });

    it('normalizes -0 to 0 uniformly in any nested position', () => {
      const complexWithNegZero = {
        a: -0,
        nested: [-0, { x: -0, y: 0 }],
      };
      const complexWithPosZero = {
        a: 0,
        nested: [0, { x: 0, y: 0 }],
      };
      expect(canonicalJson(complexWithNegZero)).toBe(canonicalJson(complexWithPosZero));
      expect(hashCanonicalJson(complexWithNegZero)).toBe(hashCanonicalJson(complexWithPosZero));
    });
  });

  describe('Property 4: SHA-256 Differential Parity with node:crypto Across Generated Inputs', () => {
    it('matches node:crypto exactly across 250 diverse generated inputs (ASCII, Unicode, Boundaries, Bytes)', () => {
      const prng = createPrng(4001);

      // 1. Random ASCII inputs (lengths 0 to 2000)
      const asciiCharset =
        ' !\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
      for (let i = 0; i < 50; i++) {
        const str = randomString(prng, 0, 500, asciiCharset);
        expect(sha256Hex(str)).toBe(nodeSha256(str));
      }

      // 2. Multilingual Unicode characters (Greek, Cyrillic, CJK, Arabic, Hebrew)
      const unicodeSamples = [
        'αβγδε',
        'Привет мир',
        'こんにちは世界',
        'مرحبا بالعالم',
        'שלום עולם',
        '€ £ ¥ CA$ A$ ₹ ₩',
      ];
      for (let i = 0; i < 50; i++) {
        let multiStr = '';
        const parts = randomInt(prng, 1, 10);
        for (let p = 0; p < parts; p++) {
          multiStr += randomChoice(prng, unicodeSamples) + ' ';
        }
        expect(sha256Hex(multiStr)).toBe(nodeSha256(multiStr));
      }

      // 3. Supplementary-plane Unicode (emojis, surrogate pairs)
      const emojis = ['😀', '🎉', '🚀', '📚', '💰', '✍️', '📖', '𝕳𝖊𝖑𝖑𝖔', '𝐀𝐁𝐂𝐃'];
      for (let i = 0; i < 50; i++) {
        let emojiStr = '';
        const count = randomInt(prng, 1, 15);
        for (let c = 0; c < count; c++) {
          emojiStr += randomChoice(prng, emojis);
        }
        expect(sha256Hex(emojiStr)).toBe(nodeSha256(emojiStr));
      }

      // 4. Critical SHA-256 block boundary lengths: 55, 56, 63, 64, 65, 119, 120, 127, 128, 129 bytes
      const boundaryLengths = [
        55, 56, 63, 64, 65, 119, 120, 127, 128, 129, 255, 256, 511, 512, 513,
      ];
      for (const len of boundaryLengths) {
        const payload = randomString(prng, len, len, '0123456789abcdef');
        expect(sha256Hex(payload)).toBe(nodeSha256(payload));
      }

      // 5. Random byte buffers (Uint8Array)
      for (let i = 0; i < 50; i++) {
        const len = randomInt(prng, 0, 1024);
        const bytes = randomBytes(prng, len);
        expect(sha256Hex(bytes)).toBe(nodeSha256(bytes));
      }
    });
  });

  describe('Property 5: Provenance Validation Exhaustively Rejects Invalid Values', () => {
    it('accepts strictly the 4 canonical classifications and rejects all generated invalid candidates', () => {
      const prng = createPrng(5001);

      // Positive verification: The 4 canonical values always pass
      for (const valid of PROVENANCE_VALUES) {
        expect(isProvenance(valid)).toBe(true);
        expect(() => assertProvenance(valid)).not.toThrow();
        expect(parseProvenance(valid)).toBe(valid);
        const wrapped = createProvenanced(100, valid);
        expect(wrapped.provenance).toBe(valid);
      }

      // Whitespace-padded values: rejected by strict guards isProvenance / assertProvenance, but parsed cleanly by parseProvenance
      const whitespacePadded = [
        ' user_input',
        'user_input ',
        ' official_fact ',
        '\testimate',
        'assumption\n',
      ];
      for (const padded of whitespacePadded) {
        expect(isProvenance(padded)).toBe(false);
        expect(() => assertProvenance(padded)).toThrow(InvalidProvenanceError);
        expect(() => createProvenanced(100, padded as unknown as Provenance)).toThrow(
          InvalidProvenanceError,
        );
        expect(parseProvenance(padded)).toBe(padded.trim());
      }

      // Negative property testing across invalid inputs
      const invalidCandidates: unknown[] = [
        // Case mutations
        'User_Input',
        'USER_INPUT',
        'Official_Fact',
        'OFFICIAL_FACT',
        'Estimate',
        'ESTIMATE',
        'Assumption',
        'ASSUMPTION',
        // Substrings / partial strings
        'user',
        'input',
        'official',
        'fact',
        'esti',
        'assump',
        '',
        '   ',
        // Non-string primitive values
        0,
        1,
        -1,
        42,
        100.5,
        NaN,
        Infinity,
        -Infinity,
        true,
        false,
        null,
        undefined,
        Symbol('user_input'),
        () => 'user_input',
        // Objects and arrays
        {},
        { provenance: 'user_input' },
        ['user_input'],
      ];

      // Add random strings not in canonical set
      for (let i = 0; i < 150; i++) {
        const candidate = randomString(prng, 1, 20, 'abcdefghijklmnopqrstuvwxyz_0123456789');
        if (!(PROVENANCE_VALUES as readonly string[]).includes(candidate)) {
          invalidCandidates.push(candidate);
        }
      }

      for (const invalid of invalidCandidates) {
        expect(isProvenance(invalid)).toBe(false);
        expect(() => assertProvenance(invalid)).toThrow(InvalidProvenanceError);
        expect(() => parseProvenance(invalid)).toThrow(InvalidProvenanceError);
        expect(() => createProvenanced(100, invalid as unknown as Provenance)).toThrow(
          InvalidProvenanceError,
        );
      }
    });
  });
});
