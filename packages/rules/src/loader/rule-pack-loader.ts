import type { RulePackId } from '@nimphy/domain';
import { RulePackInvalidError } from '../errors/rule-pack-error';
import { parseRulePack } from '../schema/validator';
import { findRulePacks, selectRulePack, type RulePackSelectionCriteria } from './selector';
import type { RulePack } from '../schema/types';

/**
 * Deterministic in-memory Rule Pack registry and loader.
 * Conforms to Module M-03 in doc 05 §M-03.
 */
export class RulePackLoader {
  private readonly packsById = new Map<RulePackId, RulePack>();
  private readonly packsByKeyAndVersion = new Map<string, RulePack>();
  private readonly packsList: RulePack[] = [];

  constructor(initialPacks?: Iterable<RulePack | unknown>) {
    if (initialPacks) {
      this.registerAll(initialPacks);
    }
  }

  /**
   * Registers a Rule Pack or raw JSON-compatible object into the loader.
   * Enforces immutability: registering a different content hash for the same
   * (packKey, version) is strictly rejected (ADR-006).
   */
  register(packOrRaw: RulePack | unknown): RulePack {
    const pack = parseRulePack(packOrRaw);
    const key = `${pack.packKey}@${pack.version}`;

    const existing = this.packsByKeyAndVersion.get(key);
    if (existing) {
      if (existing.contentHash === pack.contentHash && existing.id === pack.id) {
        // Idempotent re-registration of identical immutable pack
        return existing;
      }
      throw new RulePackInvalidError(
        `Immutability violation: Rule pack "${key}" is already registered with content hash "${existing.contentHash}". Cannot overwrite with differing pack (ADR-006).`,
        [
          {
            path: 'packKey',
            code: 'IMMUTABLE_OVERWRITE_FORBIDDEN',
            message: `Rule pack "${key}" already exists with hash "${existing.contentHash}"`,
          },
        ],
      );
    }

    this.packsById.set(pack.id, pack);
    this.packsByKeyAndVersion.set(key, pack);
    this.packsList.push(pack);

    return pack;
  }

  /**
   * Registers multiple Rule Packs.
   */
  registerAll(packs: Iterable<RulePack | unknown>): void {
    for (const p of packs) {
      this.register(p);
    }
  }

  /**
   * Loads, validates, and registers a Rule Pack from a JSON string.
   */
  loadFromJson(jsonString: string): RulePack {
    let raw: unknown;
    try {
      raw = JSON.parse(jsonString);
    } catch (err) {
      throw new RulePackInvalidError(`Failed to parse Rule Pack JSON: ${(err as Error).message}`, [
        {
          path: '',
          code: 'INVALID_JSON',
          message: (err as Error).message,
        },
      ]);
    }
    return this.register(raw);
  }

  /**
   * Loads, validates, and registers a Rule Pack from an in-memory object.
   */
  loadFromObject(raw: unknown): RulePack {
    return this.register(raw);
  }

  /**
   * Retrieves a registered Rule Pack by its nominal UUID identifier.
   */
  getById(id: RulePackId): RulePack | undefined {
    return this.packsById.get(id);
  }

  /**
   * Retrieves a registered Rule Pack by its pack key and exact SemVer version.
   */
  getByKeyAndVersion(packKey: string, version: string): RulePack | undefined {
    return this.packsByKeyAndVersion.get(`${packKey.trim()}@${version.trim()}`);
  }

  /**
   * Lists all currently registered Rule Packs.
   */
  list(): readonly RulePack[] {
    return Object.freeze([...this.packsList]);
  }

  /**
   * Resolves the single applicable Rule Pack for the given marketplace, format, and date.
   */
  select(criteria: RulePackSelectionCriteria): RulePack {
    return selectRulePack(this.packsList, criteria);
  }

  /**
   * Queries all candidate Rule Packs matching criteria, sorted by SemVer descending.
   */
  findAll(criteria: RulePackSelectionCriteria): RulePack[] {
    return findRulePacks(this.packsList, criteria);
  }

  /**
   * Returns count of registered packs.
   */
  get size(): number {
    return this.packsList.length;
  }
}
