import { describe, expect, it } from 'vitest';
import { BOOK_FORMATS, SCENARIO_NAMES, isBookFormat, isScenarioName } from './types';

describe('Shared Domain Types and Guards', () => {
  it('defines canonical scenario names: low, base, high and enforces runtime immutability', () => {
    expect(SCENARIO_NAMES).toEqual(['low', 'base', 'high']);
    expect(Object.isFrozen(SCENARIO_NAMES)).toBe(true);

    expect(() => {
      (SCENARIO_NAMES as unknown as string[]).push('medium');
    }).toThrow();
  });

  it('validates scenario names via isScenarioName', () => {
    expect(isScenarioName('low')).toBe(true);
    expect(isScenarioName('base')).toBe(true);
    expect(isScenarioName('high')).toBe(true);
    expect(isScenarioName('medium')).toBe(false);
    expect(isScenarioName('')).toBe(false);
    expect(isScenarioName(null)).toBe(false);
    expect(isScenarioName(123)).toBe(false);
  });

  it('defines canonical book formats: ebook, paperback, hardcover and enforces runtime immutability', () => {
    expect(BOOK_FORMATS).toEqual(['ebook', 'paperback', 'hardcover']);
    expect(Object.isFrozen(BOOK_FORMATS)).toBe(true);

    expect(() => {
      (BOOK_FORMATS as unknown as string[]).push('audiobook');
    }).toThrow();
  });

  it('validates book formats via isBookFormat', () => {
    expect(isBookFormat('ebook')).toBe(true);
    expect(isBookFormat('paperback')).toBe(true);
    expect(isBookFormat('hardcover')).toBe(true);
    expect(isBookFormat('audiobook')).toBe(false);
    expect(isBookFormat('')).toBe(false);
    expect(isBookFormat(null)).toBe(false);
  });
});
