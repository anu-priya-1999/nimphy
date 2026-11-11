import { describe, expect, it } from 'vitest';
import { CanonicalSerializationError } from '../errors/domain-error';
import { Money } from '../money/money';
import {
  canonicalJson,
  hasLoneSurrogate,
  hashCanonicalJson,
  isPlainObject,
  toCanonicalJson,
} from './canonical-json';
import { sha256Hex } from './sha256';

describe('Deterministic Canonical JSON & Hashing', () => {
  describe('toCanonicalJson', () => {
    it('sorts object keys in lexicographical Unicode order', () => {
      const unordered = { z: 1, a: 2, m: 3 };
      expect(toCanonicalJson(unordered)).toBe('{"a":2,"m":3,"z":1}');
    });

    it('recursively sorts keys in nested objects', () => {
      const nested = {
        meta: { version: '1.0.0', author: 'Nimphy' },
        data: { z: 10, a: 20 },
      };
      expect(toCanonicalJson(nested)).toBe(
        '{"data":{"a":20,"z":10},"meta":{"author":"Nimphy","version":"1.0.0"}}',
      );
    });

    it('preserves array element ordering while canonicalizing elements', () => {
      const objWithArray = {
        list: [
          { b: 2, a: 1 },
          { d: 4, c: 3 },
        ],
      };
      expect(toCanonicalJson(objWithArray)).toBe('{"list":[{"a":1,"b":2},{"c":3,"d":4}]}');
    });

    it('correctly formats primitives and null', () => {
      expect(toCanonicalJson('hello')).toBe('"hello"');
      expect(toCanonicalJson(42)).toBe('42');
      expect(toCanonicalJson(true)).toBe('true');
      expect(toCanonicalJson(false)).toBe('false');
      expect(toCanonicalJson(null)).toBe('null');
    });

    it('normalizes negative zero to positive zero', () => {
      expect(toCanonicalJson(-0)).toBe('0');
      expect(toCanonicalJson({ val: -0 })).toBe('{"val":0}');
    });

    it('omits undefined properties from objects', () => {
      const obj = { a: 1, b: undefined, c: 3 };
      expect(toCanonicalJson(obj)).toBe('{"a":1,"c":3}');
    });

    it('omits functions and symbols from object properties matching standard JSON', () => {
      const obj = {
        keep: 'yes',
        fn: () => 'omit',
        sym: Symbol('omit'),
        undef: undefined,
      };
      expect(toCanonicalJson(obj)).toBe('{"keep":"yes"}');
      expect(canonicalJson(obj)).toBe('{"keep":"yes"}');

      const allOmitted = { fn: () => {}, sym: Symbol(), undef: undefined };
      expect(toCanonicalJson(allOmitted)).toBe('{}');
    });

    it('converts undefined, functions, and symbols inside arrays to null matching JSON.stringify', () => {
      const arr = [1, undefined, () => 'omit', Symbol('omit'), 3];
      expect(toCanonicalJson(arr)).toBe('[1,null,null,null,3]');
      expect(canonicalJson(arr)).toBe('[1,null,null,null,3]');
    });

    it('rejects top-level undefined, functions, and symbols with CanonicalSerializationError', () => {
      expect(() => toCanonicalJson(undefined)).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson(() => 42)).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson(Symbol('test'))).toThrow(CanonicalSerializationError);
      expect(() => canonicalJson(undefined)).toThrow(CanonicalSerializationError);
      expect(() => canonicalJson(() => 42)).toThrow(CanonicalSerializationError);
      expect(() => canonicalJson(Symbol('test'))).toThrow(CanonicalSerializationError);
      expect(() => hashCanonicalJson(undefined)).toThrow(CanonicalSerializationError);
      expect(() => hashCanonicalJson(() => 42)).toThrow(CanonicalSerializationError);
      expect(() => hashCanonicalJson(Symbol('test'))).toThrow(CanonicalSerializationError);
    });

    it('canonicalizes sparse arrays and nested array holes to null', () => {
      expect(toCanonicalJson(new Array(3))).toBe('[null,null,null]');
      expect(toCanonicalJson([1, , 3])).toBe('[1,null,3]');

      const holeAtStart: unknown[] = [];
      holeAtStart[2] = 'hello';
      expect(toCanonicalJson(holeAtStart)).toBe('[null,null,"hello"]');

      const nestedSparse = [[, 2], { a: [new Array(2)] }];
      expect(toCanonicalJson(nestedSparse)).toBe('[[null,2],{"a":[[null,null]]}]');
    });

    it('rejects unsupported JavaScript objects (Map, Set, Date, RegExp, TypedArray, Class instances)', () => {
      expect(() => toCanonicalJson(new Map([['a', 1]]))).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson(new Set([1, 2]))).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson(new Date())).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson(/pattern/i)).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson(new Uint8Array([1, 2, 3]))).toThrow(CanonicalSerializationError);

      class UnserializedClass {
        value = 42;
      }
      expect(() => toCanonicalJson(new UnserializedClass())).toThrow(CanonicalSerializationError);
    });

    it('evaluates toJSON() on objects that define it (e.g. Money)', () => {
      const caseInput = {
        title: 'My Book',
        listPrice: Money.of(1499, 'USD'),
      };
      expect(toCanonicalJson(caseInput)).toBe(
        '{"listPrice":{"amountMinor":1499,"currency":"USD"},"title":"My Book"}',
      );
    });

    it('detects and rejects circular references and cycle loops through toJSON()', () => {
      const circular: Record<string, unknown> = { name: 'loop' };
      circular.self = circular;
      expect(() => toCanonicalJson(circular)).toThrow(CanonicalSerializationError);

      const nestedCirc: Record<string, unknown> = { sub: {} };
      (nestedCirc.sub as Record<string, unknown>).parent = nestedCirc;
      expect(() => toCanonicalJson(nestedCirc)).toThrow(CanonicalSerializationError);

      // Self-referential toJSON
      const selfRefToJSON: Record<string, unknown> = {};
      selfRefToJSON.toJSON = () => selfRefToJSON;
      expect(() => toCanonicalJson(selfRefToJSON)).toThrow(CanonicalSerializationError);

      // Mutual toJSON cycle
      const cycleA: Record<string, unknown> = {};
      const cycleB: Record<string, unknown> = {};
      cycleA.toJSON = () => cycleB;
      cycleB.toJSON = () => cycleA;
      expect(() => toCanonicalJson(cycleA)).toThrow(CanonicalSerializationError);

      // toJSON returning unsupported type
      const badToJSON = { toJSON: () => new Map() };
      expect(() => toCanonicalJson(badToJSON)).toThrow(CanonicalSerializationError);
    });

    it('allows repeated references across independent branches in DAG without false positive cycle error', () => {
      const shared = { name: 'shared', count: 1 };
      const root = {
        firstBranch: shared,
        secondBranch: shared,
      };
      expect(toCanonicalJson(root)).toBe(
        '{"firstBranch":{"count":1,"name":"shared"},"secondBranch":{"count":1,"name":"shared"}}',
      );

      // Repeated references in array
      const arrWithRepeated = [shared, shared];
      expect(toCanonicalJson(arrWithRepeated)).toBe(
        '[{"count":1,"name":"shared"},{"count":1,"name":"shared"}]',
      );
    });

    it('detects and rejects circular references within arrays', () => {
      const arr: unknown[] = [1, 2];
      arr.push(arr);
      expect(() => toCanonicalJson(arr)).toThrow(CanonicalSerializationError);
    });

    it('rejects arrays containing unsupported object types, non-finite numbers, or BigInt', () => {
      expect(() => toCanonicalJson([new Map()])).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson([new Set()])).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson([new Date()])).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson([/pattern/i])).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson([1, NaN])).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson([1, Infinity])).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson([1, 10n])).toThrow(CanonicalSerializationError);
    });

    it('rejects non-finite numbers', () => {
      expect(() => toCanonicalJson(NaN)).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson({ val: Infinity })).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson([-Infinity])).toThrow(CanonicalSerializationError);
    });

    it('rejects BigInt without custom serializer', () => {
      expect(() => toCanonicalJson({ big: 100n })).toThrow(CanonicalSerializationError);
    });

    it('rejects strings containing lone or unpaired surrogate code units per RFC 8785 §3.2.2.2', () => {
      expect(() => toCanonicalJson('\uDEAD')).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson('\uD800')).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson('\uDC00')).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson('\uD800A')).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson('A\uDC00')).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson('\uD800\uD800')).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson(['valid', '\uDEAD'])).toThrow(CanonicalSerializationError);
    });

    it('rejects object property keys containing lone or unpaired surrogate code units per RFC 8785 §3.2.2.2', () => {
      expect(() => toCanonicalJson({ ['\uDEAD']: 1 })).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson({ ['\uD800']: 1 })).toThrow(CanonicalSerializationError);
      expect(() => toCanonicalJson({ ['\uDC00']: 1 })).toThrow(CanonicalSerializationError);
    });

    it('preserves valid surrogate pairs (e.g. emojis) without escaping', () => {
      const emojiObj = { emoji: '😀', symbol: '𐍈' };
      expect(toCanonicalJson(emojiObj)).toBe('{"emoji":"😀","symbol":"𐍈"}');
    });

    it('supports null-prototype objects and class instances with custom toJSON', () => {
      const nullProto = Object.create(null);
      nullProto.b = 2;
      nullProto.a = 1;
      expect(toCanonicalJson(nullProto)).toBe('{"a":1,"b":2}');

      const objWithAnonymousCtor = Object.create({ constructor: null });
      expect(() => toCanonicalJson(objWithAnonymousCtor)).toThrow(CanonicalSerializationError);
    });

    it('strictly satisfies RFC 8785 (JCS) Appendix E canonicalization test vector', () => {
      // Direct parse of the exact RFC 8785 Appendix E JSON document input
      const rfcInputJson =
        '{\n' +
        '  "numbers": [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001],\n' +
        '  "string": "\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/",\n' +
        '  "literals": [null, true, false]\n' +
        '}';
      const parsedInput = JSON.parse(rfcInputJson);
      // In RFC 8785 Appendix E canonical output, the string value in JSON text has:
      // € $ \u000f \n A ' B \" \\\\ \" /
      const expected =
        '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}';
      expect(toCanonicalJson(parsedInput)).toBe(expected);
    });

    it('strictly satisfies RFC 8785 nested structures and empty/numeric key sorting', () => {
      const input = {
        '111': [{ e: 'yes', E: 'no' }],
        '10': {},
        '': 'empty',
        '1': {
          f: { f: 'hi', F: 5 },
          '\n': 56.0,
        },
        a: {},
        A: {},
      };
      // UTF-16 code unit order: "" (len 0), "\n" (10), "1" (49), "10" (49, 48), "111" (49, 49), "A" (65), "a" (97)
      const expected =
        '{"":"empty","1":{"\\n":56,"f":{"F":5,"f":"hi"}},"10":{},"111":[{"E":"no","e":"yes"}],"A":{},"a":{}}';
      expect(toCanonicalJson(input)).toBe(expected);
    });

    it('strictly satisfies RFC 8785 french.json lexicographical code-unit sorting ignoring locale', () => {
      const input = {
        sin: 'ignore locale',
        pêche: 'but canonicalization MUST',
        peach: 'This sorting order',
        péché: 'is wrong according to French',
      };
      // UTF-16 code units: 'p'(112) < 's'(115); within 'p': 'e'(101) < 'é'(233) < 'ê'(234)
      const expected =
        '{"peach":"This sorting order","péché":"is wrong according to French","pêche":"but canonicalization MUST","sin":"ignore locale"}';
      expect(toCanonicalJson(input)).toBe(expected);
    });

    it('strictly satisfies RFC 8785 unicode.json unnormalized Unicode preservation', () => {
      const input = { 'Unnormalized Unicode': 'A\u030a' };
      const expected = '{"Unnormalized Unicode":"A\u030a"}';
      expect(toCanonicalJson(input)).toBe(expected);
    });

    it('verifies helper functions isPlainObject and hasLoneSurrogate across edge cases', () => {
      expect(isPlainObject(null)).toBe(false);
      expect(isPlainObject(undefined)).toBe(false);
      expect(isPlainObject('string')).toBe(false);
      expect(isPlainObject(123)).toBe(false);
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject(Object.create(null))).toBe(true);

      expect(hasLoneSurrogate('normal text')).toBe(false);
      expect(hasLoneSurrogate('😀')).toBe(false);
      expect(hasLoneSurrogate('\uDEAD')).toBe(true);
      expect(hasLoneSurrogate('\uD800')).toBe(true);
      expect(hasLoneSurrogate('\uDC00')).toBe(true);
      expect(hasLoneSurrogate('\uD800valid')).toBe(true);
    });
  });

  describe('hashCanonicalJson', () => {
    it('produces identical sha256: prefixed hashes regardless of object key insertion order', () => {
      const objA = { alpha: 'first', beta: 2, gamma: { nested: true, count: 5 } };
      const objB = { gamma: { count: 5, nested: true }, beta: 2, alpha: 'first' };

      const hashA = hashCanonicalJson(objA);
      const hashB = hashCanonicalJson(objB);

      expect(hashA).toBe(hashB);
      expect(hashA.startsWith('sha256:')).toBe(true);
      expect(hashA).toHaveLength(71); // 'sha256:' (7) + 64 hex chars
    });

    it('supports unprefixed hex hash when requested', () => {
      const hash = hashCanonicalJson({ key: 'val' }, false);
      expect(hash.startsWith('sha256:')).toBe(false);
      expect(hash).toHaveLength(64);
    });

    it('produces distinct hashes for distinct input structures', () => {
      const hash1 = hashCanonicalJson({ price: 1499 });
      const hash2 = hashCanonicalJson({ price: 1500 });
      expect(hash1).not.toBe(hash2);
    });

    it('ensures full consistency between canonicalJson() and hashCanonicalJson() across supported types', () => {
      const samples = [
        { z: 1, a: [2, 3] },
        'string value',
        12345,
        -0,
        true,
        false,
        null,
        [1, null, 'text', { k: 'v' }],
        Money.of(1499, 'USD'),
      ];

      for (const sample of samples) {
        const canonical = canonicalJson(sample);
        expect(canonical).toBe(toCanonicalJson(sample));
        expect(hashCanonicalJson(sample)).toBe(`sha256:${sha256Hex(canonical)}`);
        expect(hashCanonicalJson(sample, false)).toBe(sha256Hex(canonical));
      }
    });
  });
});
