import fs from 'node:fs';
import path from 'node:path';
import { RulePackInvalidError } from '../errors/rule-pack-error';
import { parseRulePack } from '../schema/validator';
import type { RulePack } from '../schema/types';

/**
 * Loads and validates a Rule Pack from a JSON file on disk.
 *
 * @param filePath Absolute or relative path to the Rule Pack JSON file
 * @returns Fully validated and frozen RulePack instance
 */
export function loadRulePackFromFile(filePath: string): RulePack {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new RulePackInvalidError(`Rule pack file not found at: "${resolvedPath}"`, [
      {
        path: 'filePath',
        code: 'FILE_NOT_FOUND',
        message: `File does not exist: "${resolvedPath}"`,
      },
    ]);
  }

  let fileContent: string;
  try {
    fileContent = fs.readFileSync(resolvedPath, 'utf8');
  } catch (err) {
    throw new RulePackInvalidError(
      `Failed to read Rule Pack file at "${resolvedPath}": ${(err as Error).message}`,
      [
        {
          path: 'filePath',
          code: 'FILE_READ_ERROR',
          message: (err as Error).message,
        },
      ],
    );
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(fileContent);
  } catch (err) {
    throw new RulePackInvalidError(
      `Failed to parse JSON in Rule Pack file at "${resolvedPath}": ${(err as Error).message}`,
      [
        {
          path: '',
          code: 'INVALID_JSON',
          message: (err as Error).message,
        },
      ],
    );
  }

  return parseRulePack(rawJson);
}

/**
 * Recursively scans a directory for rule pack JSON files (e.g. "pack.json" or "*.rulepack.json")
 * and loads all valid packs.
 *
 * @param dirPath Directory path to scan
 * @returns Array of validated RulePack entities
 */
export function loadRulePacksFromDirectory(dirPath: string): RulePack[] {
  const resolvedDir = path.resolve(dirPath);
  if (!fs.existsSync(resolvedDir)) {
    throw new RulePackInvalidError(`Directory not found: "${resolvedDir}"`, [
      {
        path: 'dirPath',
        code: 'DIRECTORY_NOT_FOUND',
        message: `Directory does not exist: "${resolvedDir}"`,
      },
    ]);
  }

  const packs: RulePack[] = [];

  function scan(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (
        entry.isFile() &&
        (entry.name === 'pack.json' || entry.name.endsWith('.rulepack.json'))
      ) {
        packs.push(loadRulePackFromFile(fullPath));
      }
    }
  }

  scan(resolvedDir);
  return packs;
}
