import { CanonicalSerializationError } from '../errors/domain-error';
import { sha256Hex } from './sha256';

/**
 * Checks whether an object is a plain JavaScript object (Object.prototype or null prototype).
 */
export function isPlainObject(val: unknown): val is Record<string, unknown> {
  if (typeof val !== 'object' || val === null) return false;
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

/**
 * Detects whether a string contains invalid Unicode data (lone or unpaired surrogate code units)
 * per RFC 8785 §3.2.2.2.
 */
export function hasLoneSurrogate(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      i++;
      if (i >= str.length) return true;
      const next = str.charCodeAt(i);
      if (next < 0xdc00 || next > 0xdfff) return true;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

/**
 * Deterministically serializes any supported domain value into a canonical JSON string.
 *
 * Conforms strictly to RFC 8785 (JSON Canonicalization Scheme / JCS) for all standard JSON
 * data models (objects, arrays, strings, numbers, booleans, null):
 * 1. Object property names are sorted strictly by UTF-16 code units (RFC 8785 §3.2.3).
 * 2. Numbers are formatted via ECMAScript Number.prototype.toString(10), normalizing -0 to 0
 *    and rejecting non-finite values (RFC 8785 §3.2.2.3).
 * 3. Strings escape only required structural/control characters using lowercase hex, leave
 *    solidus unescaped, and emit valid UTF-8 code points directly (RFC 8785 §3.2.2.2).
 * 4. Invalid Unicode (lone or unpaired surrogate code units) in string values or property keys
 *    causes immediate termination with CanonicalSerializationError (RFC 8785 §3.2.2.2).
 * 5. Whitespace is strictly eliminated (RFC 8785 §3.2.1).
 *
 * Domain-specific extensions for JavaScript data models:
 * 6. Top-level unsupported values (undefined, functions, symbols) are rejected with CanonicalSerializationError.
 * 7. Objects with a `toJSON()` method (e.g. Money value objects) are evaluated first.
 * 8. Active-path cycle detection rejects circular references without rejecting DAGs.
 * 9. Non-plain objects without toJSON() (Map, Set, Date, RegExp, TypedArray, class instances) are rejected.
 * 10. BigInt values are rejected with CanonicalSerializationError.
 *
 * Used for inputs_hash, results_hash, content_hash (doc 06 §4, doc 07 §4, doc 12 §3.4).
 */
export function toCanonicalJson(value: unknown): string {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    throw new CanonicalSerializationError(
      `Cannot canonically serialize top-level ${typeof value} value`,
    );
  }

  const activePath = new Set<object>();

  function serialize(current: unknown): string | undefined {
    if (current === null) {
      return 'null';
    }

    if (typeof current === 'string') {
      if (hasLoneSurrogate(current)) {
        throw new CanonicalSerializationError(
          'Cannot canonically serialize string containing lone or unpaired surrogate code unit (RFC 8785 §3.2.2.2)',
        );
      }
      return JSON.stringify(current);
    }

    if (typeof current === 'number') {
      if (!Number.isFinite(current)) {
        throw new CanonicalSerializationError(
          `Cannot canonically serialize non-finite number: ${String(current)}`,
        );
      }
      return Object.is(current, -0) ? '0' : String(current);
    }

    if (typeof current === 'boolean') {
      return current ? 'true' : 'false';
    }

    if (current === undefined || typeof current === 'function' || typeof current === 'symbol') {
      return undefined;
    }

    if (typeof current === 'bigint') {
      throw new CanonicalSerializationError(
        `BigInt value ${String(current)} cannot be serialized to JSON without explicit conversion.`,
      );
    }

    const obj = current as object;

    // Check for cycles on the active traversal path
    if (activePath.has(obj)) {
      throw new CanonicalSerializationError(
        'Circular reference detected during canonical JSON serialization',
      );
    }

    // Explicitly reject known non-plain objects that must not be serialized as plain objects or via default toJSON
    if (
      obj instanceof Map ||
      obj instanceof Set ||
      obj instanceof Date ||
      obj instanceof RegExp ||
      ArrayBuffer.isView(obj) ||
      obj instanceof ArrayBuffer
    ) {
      const typeName = Object.prototype.toString.call(obj).slice(8, -1);
      throw new CanonicalSerializationError(
        `Cannot canonically serialize unsupported object type: ${typeName}`,
      );
    }

    activePath.add(obj);

    try {
      // If object has a custom toJSON method, evaluate it
      if (typeof (obj as { toJSON?: unknown }).toJSON === 'function') {
        const toJSONFn = (obj as { toJSON: () => unknown }).toJSON;
        const transformed = toJSONFn.call(obj);
        if (
          transformed !== null &&
          typeof transformed === 'object' &&
          activePath.has(transformed as object)
        ) {
          throw new CanonicalSerializationError(
            'Circular reference detected during canonical JSON serialization',
          );
        }
        return serialize(transformed);
      }

      // Handle Arrays (including sparse arrays)
      if (Array.isArray(obj)) {
        const items: string[] = [];
        for (let i = 0; i < obj.length; i++) {
          const item = obj[i];
          const res = serialize(item);
          items.push(res === undefined ? 'null' : res);
        }
        return `[${items.join(',')}]`;
      }

      // Plain objects
      if (!isPlainObject(obj)) {
        const className =
          (obj as { constructor?: { name?: string } }).constructor?.name || 'Object';
        throw new CanonicalSerializationError(
          `Cannot canonically serialize class instance or non-plain object without toJSON(): ${className}`,
        );
      }

      const keys = Object.keys(obj).sort();
      const entries: string[] = [];

      for (const key of keys) {
        if (hasLoneSurrogate(key)) {
          throw new CanonicalSerializationError(
            'Cannot canonically serialize object key containing lone or unpaired surrogate code unit (RFC 8785 §3.2.2.2)',
          );
        }
        const propVal = (obj as Record<string, unknown>)[key];
        const serializedProp = serialize(propVal);
        if (serializedProp !== undefined) {
          entries.push(`${JSON.stringify(key)}:${serializedProp}`);
        }
      }

      return `{${entries.join(',')}}`;
    } finally {
      activePath.delete(obj);
    }
  }

  return serialize(value)!;
}

/**
 * Deterministically serializes any supported domain value into a canonical JSON string.
 * Alias for toCanonicalJson().
 */
export const canonicalJson = toCanonicalJson;

/**
 * Computes the deterministic SHA-256 hash of a value's canonical JSON representation.
 * Returns in format "sha256:<64-hex>" (or bare hex if prefix is false).
 * Doc 06 §4 (inputs_hash, results_hash, content_hash).
 */
export function hashCanonicalJson(value: unknown, prefix = true): string {
  const canonicalString = toCanonicalJson(value);
  const hex = sha256Hex(canonicalString);
  return prefix ? `sha256:${hex}` : hex;
}
