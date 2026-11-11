import { describe, expect, it } from 'vitest';
import { InvalidProvenanceError } from '../errors/domain-error';
import {
  PROVENANCE_DESCRIPTIONS,
  PROVENANCE_VALUES,
  Provenance,
  Provenanced,
  assertProvenance,
  createProvenanced,
  isProvenance,
  isUncertain,
  parseProvenance,
} from './provenance';

describe('Provenance Classification', () => {
  it('defines the 4 canonical provenance classifications', () => {
    expect(PROVENANCE_VALUES).toEqual(['user_input', 'official_fact', 'estimate', 'assumption']);
  });

  it('enforces runtime immutability on PROVENANCE_VALUES array', () => {
    expect(Object.isFrozen(PROVENANCE_VALUES)).toBe(true);
    expect(() => {
      (PROVENANCE_VALUES as unknown as string[]).push('guess');
    }).toThrow();
  });

  it('provides descriptions for all provenance classifications', () => {
    for (const val of PROVENANCE_VALUES) {
      expect(PROVENANCE_DESCRIPTIONS[val]).toBeDefined();
      expect(typeof PROVENANCE_DESCRIPTIONS[val]).toBe('string');
    }
  });

  describe('isProvenance', () => {
    it('returns true for all canonical provenance values', () => {
      for (const val of PROVENANCE_VALUES) {
        expect(isProvenance(val)).toBe(true);
      }
    });

    it('returns false for unknown or invalid values', () => {
      expect(isProvenance('guess')).toBe(false);
      expect(isProvenance('fact')).toBe(false);
      expect(isProvenance('USER_INPUT')).toBe(false); // case sensitive
      expect(isProvenance('')).toBe(false);
      expect(isProvenance(null)).toBe(false);
      expect(isProvenance(undefined)).toBe(false);
      expect(isProvenance(123)).toBe(false);
      expect(isProvenance({})).toBe(false);
    });
  });

  describe('assertProvenance', () => {
    it('succeeds for valid provenance values', () => {
      expect(() => assertProvenance('user_input')).not.toThrow();
      expect(() => assertProvenance('official_fact')).not.toThrow();
      expect(() => assertProvenance('estimate')).not.toThrow();
      expect(() => assertProvenance('assumption')).not.toThrow();
    });

    it('throws InvalidProvenanceError for invalid values', () => {
      expect(() => assertProvenance('unverified')).toThrow(InvalidProvenanceError);
      expect(() => assertProvenance(123)).toThrow(InvalidProvenanceError);
    });
  });

  describe('parseProvenance', () => {
    it('parses valid provenance strings with whitespace trimmed', () => {
      expect(parseProvenance('user_input')).toBe('user_input');
      expect(parseProvenance('  official_fact  ')).toBe('official_fact');
      expect(parseProvenance('estimate')).toBe('estimate');
      expect(parseProvenance('assumption')).toBe('assumption');
    });

    it('throws InvalidProvenanceError on invalid or non-string input', () => {
      expect(() => parseProvenance('invalid')).toThrow(InvalidProvenanceError);
      expect(() => parseProvenance(null)).toThrow(InvalidProvenanceError);
      expect(() => parseProvenance(undefined)).toThrow(InvalidProvenanceError);
      expect(() => parseProvenance(42)).toThrow(InvalidProvenanceError);
    });
  });

  describe('isUncertain', () => {
    it('identifies estimate and assumption as uncertain', () => {
      expect(isUncertain('estimate')).toBe(true);
      expect(isUncertain('assumption')).toBe(true);
    });

    it('identifies user_input and official_fact as not uncertain', () => {
      expect(isUncertain('user_input')).toBe(false);
      expect(isUncertain('official_fact')).toBe(false);
    });
  });

  describe('Provenanced<T> Structure', () => {
    it('supports typing provenanced values with optional evidence refs', () => {
      const provenancedPrice: Provenanced<number> = {
        value: 1499,
        provenance: 'user_input',
      };
      expect(provenancedPrice.value).toBe(1499);
      expect(provenancedPrice.provenance).toBe('user_input');

      const estimatedCost: Provenanced<{ amountMinor: number; currency: string }> = {
        value: { amountMinor: 450, currency: 'USD' },
        provenance: 'estimate',
        evidenceRefs: ['ev_1'],
      };
      expect(estimatedCost.evidenceRefs).toEqual(['ev_1']);
    });
  });

  describe('createProvenanced factory', () => {
    it('creates an immutable provenanced wrapper with validated provenance', () => {
      const item = createProvenanced(100, 'official_fact');
      expect(item.value).toBe(100);
      expect(item.provenance).toBe('official_fact');
      expect(item.evidenceRefs).toBeUndefined();
      expect(Object.isFrozen(item)).toBe(true);
    });

    it('defensively copies and freezes evidence references', () => {
      const mutableRefs = ['ref-1', 'ref-2'];
      const item = createProvenanced({ rate: 0.15 }, 'estimate', mutableRefs);

      expect(item.evidenceRefs).toEqual(['ref-1', 'ref-2']);
      expect(Object.isFrozen(item.evidenceRefs)).toBe(true);

      // Mutating source array does not affect the provenanced wrapper
      mutableRefs.push('ref-3');
      expect(item.evidenceRefs).toEqual(['ref-1', 'ref-2']);

      expect(() => {
        (item.evidenceRefs as string[]).push('ref-4');
      }).toThrow();
    });

    it('throws InvalidProvenanceError on invalid provenance classification', () => {
      expect(() => {
        createProvenanced(100, 'unverified' as unknown as Provenance);
      }).toThrow(InvalidProvenanceError);
    });
  });
});
