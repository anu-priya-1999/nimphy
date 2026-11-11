import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RulePackInvalidError } from '../errors/rule-pack-error';
import { TEST_EBOOK_STANDARD_1_0_0 } from '../synthetic/test-packs';
import { loadRulePackFromFile, loadRulePacksFromDirectory } from './fs-loader';

describe('Filesystem Rule Pack Loader', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimphy-rules-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error in tests
    }
  });

  it('loads a valid rule pack from a JSON file on disk', () => {
    const packFilePath = path.join(tempDir, 'pack.json');
    fs.writeFileSync(packFilePath, JSON.stringify(TEST_EBOOK_STANDARD_1_0_0, null, 2), 'utf8');

    const loaded = loadRulePackFromFile(packFilePath);
    expect(loaded.packKey).toBe('TEST_EBOOK_STANDARD');
    expect(loaded.version).toBe('1.0.0');
    expect(loaded.contentHash).toBe(TEST_EBOOK_STANDARD_1_0_0.contentHash);
  });

  it('throws RulePackInvalidError when file does not exist', () => {
    const nonExistent = path.join(tempDir, 'missing.json');
    expect(() => loadRulePackFromFile(nonExistent)).toThrow(RulePackInvalidError);
  });

  it('throws RulePackInvalidError with FILE_READ_ERROR when file cannot be read as text', () => {
    // Passing a directory path causes readFileSync to throw EISDIR
    expect(() => loadRulePackFromFile(tempDir)).toThrow(RulePackInvalidError);
  });

  it('throws RulePackInvalidError when file contains invalid JSON', () => {
    const badJsonPath = path.join(tempDir, 'bad.json');
    fs.writeFileSync(badJsonPath, '{ not valid json', 'utf8');
    expect(() => loadRulePackFromFile(badJsonPath)).toThrow(RulePackInvalidError);
  });

  it('scans a directory and recursively loads all pack.json files', () => {
    const subDir1 = path.join(tempDir, 'pack1');
    const subDir2 = path.join(tempDir, 'nested', 'pack2');
    fs.mkdirSync(subDir1, { recursive: true });
    fs.mkdirSync(subDir2, { recursive: true });

    fs.writeFileSync(
      path.join(subDir1, 'pack.json'),
      JSON.stringify(TEST_EBOOK_STANDARD_1_0_0),
      'utf8',
    );

    const pack2 = {
      ...TEST_EBOOK_STANDARD_1_0_0,
      id: '550e8400-e29b-41d4-a716-446655440009',
      version: '2.0.0',
    };
    fs.writeFileSync(path.join(subDir2, 'pack.json'), JSON.stringify(pack2), 'utf8');

    const loadedPacks = loadRulePacksFromDirectory(tempDir);
    expect(loadedPacks.length).toBe(2);
    expect(loadedPacks.some((p) => p.version === '1.0.0')).toBe(true);
    expect(loadedPacks.some((p) => p.version === '2.0.0')).toBe(true);
  });

  it('throws RulePackInvalidError when scanning non-existent directory', () => {
    expect(() => loadRulePacksFromDirectory(path.join(tempDir, 'non_existent'))).toThrow(
      RulePackInvalidError,
    );
  });
});
