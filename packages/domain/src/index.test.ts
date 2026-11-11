import { describe, expect, it } from 'vitest';
import * as RootDomain from './index';
import * as CanonicalBarrel from './canonical/index';
import * as ErrorsBarrel from './errors/index';
import * as IdentifiersBarrel from './identifiers/index';
import * as MoneyBarrel from './money/index';
import * as ProvenanceBarrel from './provenance/index';

describe('@nimphy/domain Public Entrypoint & Barrels', () => {
  it('exports root module metadata constants', () => {
    expect(RootDomain.DOMAIN_MODULE_NAME).toBe('domain');
    expect(RootDomain.DOMAIN_MODULE_VERSION).toBe('0.1.0');
  });

  it('exports all domain error classes from root and errors barrel', () => {
    expect(RootDomain.DomainError).toBeDefined();
    expect(RootDomain.InvalidMoneyError).toBeDefined();
    expect(RootDomain.CurrencyMismatchError).toBeDefined();
    expect(RootDomain.MoneyOverflowError).toBeDefined();
    expect(RootDomain.UnsupportedCurrencyError).toBeDefined();
    expect(RootDomain.InvalidProvenanceError).toBeDefined();
    expect(RootDomain.InvalidIdentifierError).toBeDefined();
    expect(RootDomain.CanonicalSerializationError).toBeDefined();

    expect(ErrorsBarrel.DomainError).toBe(RootDomain.DomainError);
    expect(ErrorsBarrel.InvalidMoneyError).toBe(RootDomain.InvalidMoneyError);
    expect(ErrorsBarrel.CurrencyMismatchError).toBe(RootDomain.CurrencyMismatchError);
    expect(ErrorsBarrel.MoneyOverflowError).toBe(RootDomain.MoneyOverflowError);
    expect(ErrorsBarrel.UnsupportedCurrencyError).toBe(RootDomain.UnsupportedCurrencyError);
    expect(ErrorsBarrel.InvalidProvenanceError).toBe(RootDomain.InvalidProvenanceError);
    expect(ErrorsBarrel.InvalidIdentifierError).toBe(RootDomain.InvalidIdentifierError);
    expect(ErrorsBarrel.CanonicalSerializationError).toBe(RootDomain.CanonicalSerializationError);
  });

  it('exports money and currency utilities from root and money barrel', () => {
    expect(RootDomain.Money).toBeDefined();
    expect(RootDomain.SUPPORTED_CURRENCIES).toBeDefined();
    expect(RootDomain.CURRENCY_METADATA).toBeDefined();
    expect(RootDomain.isSupportedCurrency).toBeDefined();
    expect(RootDomain.assertSupportedCurrency).toBeDefined();
    expect(RootDomain.parseCurrencyCode).toBeDefined();
    expect(RootDomain.getCurrencyMetadata).toBeDefined();
    expect(RootDomain.getMinorUnitExponent).toBeDefined();

    expect(MoneyBarrel.Money).toBe(RootDomain.Money);
    expect(MoneyBarrel.SUPPORTED_CURRENCIES).toBe(RootDomain.SUPPORTED_CURRENCIES);
  });

  it('exports provenance utilities from root and provenance barrel', () => {
    expect(RootDomain.PROVENANCE_VALUES).toBeDefined();
    expect(RootDomain.PROVENANCE_DESCRIPTIONS).toBeDefined();
    expect(RootDomain.isProvenance).toBeDefined();
    expect(RootDomain.assertProvenance).toBeDefined();
    expect(RootDomain.parseProvenance).toBeDefined();
    expect(RootDomain.isUncertain).toBeDefined();
    expect(RootDomain.createProvenanced).toBeDefined();

    expect(ProvenanceBarrel.PROVENANCE_VALUES).toBe(RootDomain.PROVENANCE_VALUES);
    expect(ProvenanceBarrel.createProvenanced).toBe(RootDomain.createProvenanced);
  });

  it('exports branded identifiers utilities from root and identifiers barrel', () => {
    expect(RootDomain.isUuidString).toBeDefined();
    expect(RootDomain.parseBrandedId).toBeDefined();
    expect(RootDomain.parseUserId).toBeDefined();
    expect(RootDomain.parseCaseId).toBeDefined();
    expect(RootDomain.parseRevisionId).toBeDefined();
    expect(RootDomain.parseEvidenceId).toBeDefined();
    expect(RootDomain.parseRulePackId).toBeDefined();
    expect(RootDomain.parseRunId).toBeDefined();
    expect(RootDomain.parseMemoId).toBeDefined();
    expect(RootDomain.parseDossierId).toBeDefined();
    expect(RootDomain.parsePricePointId).toBeDefined();
    expect(RootDomain.parseOrderId).toBeDefined();
    expect(RootDomain.parsePaymentEventId).toBeDefined();
    expect(RootDomain.parseEntitlementId).toBeDefined();

    expect(RootDomain.isUserId).toBeDefined();
    expect(RootDomain.isCaseId).toBeDefined();
    expect(RootDomain.isRevisionId).toBeDefined();
    expect(RootDomain.isEvidenceId).toBeDefined();
    expect(RootDomain.isRulePackId).toBeDefined();
    expect(RootDomain.isRunId).toBeDefined();
    expect(RootDomain.isMemoId).toBeDefined();
    expect(RootDomain.isDossierId).toBeDefined();
    expect(RootDomain.isPricePointId).toBeDefined();
    expect(RootDomain.isOrderId).toBeDefined();
    expect(RootDomain.isPaymentEventId).toBeDefined();
    expect(RootDomain.isEntitlementId).toBeDefined();

    expect(IdentifiersBarrel.parseUserId).toBe(RootDomain.parseUserId);
    expect(IdentifiersBarrel.isUserId).toBe(RootDomain.isUserId);
  });

  it('exports canonical JSON and SHA-256 utilities from root and canonical barrel', () => {
    expect(RootDomain.sha256Hex).toBeDefined();
    expect(RootDomain.toCanonicalJson).toBeDefined();
    expect(RootDomain.canonicalJson).toBeDefined();
    expect(RootDomain.canonicalJson).toBe(RootDomain.toCanonicalJson);
    expect(RootDomain.hashCanonicalJson).toBeDefined();

    expect(CanonicalBarrel.sha256Hex).toBe(RootDomain.sha256Hex);
    expect(CanonicalBarrel.toCanonicalJson).toBe(RootDomain.toCanonicalJson);
    expect(CanonicalBarrel.canonicalJson).toBe(RootDomain.canonicalJson);
    expect(CanonicalBarrel.hashCanonicalJson).toBe(RootDomain.hashCanonicalJson);
  });

  it('exports shared domain enums and guards', () => {
    expect(RootDomain.SCENARIO_NAMES).toBeDefined();
    expect(RootDomain.isScenarioName).toBeDefined();
    expect(RootDomain.BOOK_FORMATS).toBeDefined();
    expect(RootDomain.isBookFormat).toBeDefined();
  });
});
