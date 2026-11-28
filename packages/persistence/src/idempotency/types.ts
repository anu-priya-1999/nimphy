import type { UserId } from '@nimphy/domain';

export type IdempotencyClaimResult =
  | { readonly status: 'claimed' }
  | {
      readonly status: 'replay';
      readonly responseStatus: number;
      readonly responseBody: unknown;
    }
  | { readonly status: 'conflict'; readonly reason: 'payload_mismatch' | 'in_progress' };

export interface IdempotencyClaimInput {
  readonly userId: UserId;
  readonly endpoint: string;
  readonly key: string;
  readonly requestHash: string;
}

export interface IdempotencyCompleteInput {
  readonly userId: UserId;
  readonly endpoint: string;
  readonly key: string;
  readonly responseStatus: number;
  readonly responseBody: unknown;
}

export interface IdempotencyReleaseInput {
  readonly userId: UserId;
  readonly endpoint: string;
  readonly key: string;
}

export interface IdempotencyRepository {
  claim(input: IdempotencyClaimInput): Promise<IdempotencyClaimResult>;
  complete(input: IdempotencyCompleteInput): Promise<void>;
  release(input: IdempotencyReleaseInput): Promise<void>;
}
