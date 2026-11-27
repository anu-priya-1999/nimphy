import type { UserId } from '@nimphy/domain';

export type AppUserStatus = 'active' | 'pending_deletion' | 'deleted';

export interface AppUserRecord {
  readonly id: UserId;
  readonly idpSubject: string | null;
  readonly email: string | null;
  readonly status: AppUserStatus;
  readonly createdAt: Date;
}

export interface ProvisionUserInput {
  readonly idpSubject: string;
  readonly email: string | null;
}

export interface ProvisionUserResult {
  readonly user: AppUserRecord;
  readonly created: boolean;
}

export interface UserRepository {
  findByIdpSubject(idpSubject: string): Promise<AppUserRecord | null>;
  findOrCreateByIdpSubject(input: ProvisionUserInput): Promise<ProvisionUserResult>;
}
