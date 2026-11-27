import { parseUserId, type UserId } from '@nimphy/domain';
import type { AppUserRecord, ProvisionUserInput, UserRepository } from '@nimphy/persistence';
import { describe, expect, it, vi } from 'vitest';
import {
  currentUserWithDeps,
  IdentityInfrastructureError,
  InactiveAccountError,
  requireCurrentUserWithDeps,
  resolveCurrentUser,
  UnauthenticatedError,
  type AuthProviderPort,
} from './identity';

const FIXED_UUIDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
] as const;

function createInMemoryUserRepo(initial: AppUserRecord[] = []): {
  repo: UserRepository;
  records: AppUserRecord[];
} {
  const records = [...initial];
  let nextIdx = records.length;

  const repo: UserRepository = {
    async findByIdpSubject(idpSubject: string): Promise<AppUserRecord | null> {
      return records.find((r) => r.idpSubject === idpSubject) ?? null;
    },
    async findOrCreateByIdpSubject(input: ProvisionUserInput) {
      const existing = records.find((r) => r.idpSubject === input.idpSubject);
      if (existing) {
        return { user: existing, created: false };
      }
      const created: AppUserRecord = {
        id: parseUserId(FIXED_UUIDS[nextIdx++] ?? '44444444-4444-4444-8444-444444444444'),
        idpSubject: input.idpSubject,
        email: input.email ? input.email.toLowerCase() : null,
        status: 'active',
        createdAt: new Date('2026-11-26T00:00:00.000Z'),
      };
      records.push(created);
      return { user: created, created: true };
    },
  };

  return { repo, records };
}

describe('Nimphy identity resolution', () => {
  it('returns unauthenticated when Clerk has no active user', async () => {
    const { repo } = createInMemoryUserRepo();
    const authProvider: AuthProviderPort = {
      getAuthenticatedSubject: async () => null,
    };

    const resolution = await resolveCurrentUser({ authProvider, userRepository: repo });
    expect(resolution).toEqual({ status: 'unauthenticated' });

    const user = await currentUserWithDeps({ authProvider, userRepository: repo });
    expect(user).toBeNull();

    await expect(
      requireCurrentUserWithDeps({ authProvider, userRepository: repo }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('resolves an existing active user without calling Clerk backend profile API', async () => {
    const expectedId: UserId = parseUserId(FIXED_UUIDS[0]);
    const { repo } = createInMemoryUserRepo([
      {
        id: expectedId,
        idpSubject: 'user_clerk_active',
        email: 'author@example.com',
        status: 'active',
        createdAt: new Date('2026-11-26T00:00:00.000Z'),
      },
    ]);
    const getPrimaryVerifiedEmail = vi.fn(async () => 'author@example.com');
    const authProvider: AuthProviderPort = {
      getAuthenticatedSubject: async () => 'user_clerk_active',
      getPrimaryVerifiedEmail,
    };

    const user = await requireCurrentUserWithDeps({ authProvider, userRepository: repo });
    expect(user).toEqual({
      id: expectedId,
      idpSubject: 'user_clerk_active',
      email: 'author@example.com',
    });
    expect(getPrimaryVerifiedEmail).not.toHaveBeenCalled();
  });

  it('provisions a new local user on first sign-in and reuses it thereafter', async () => {
    const { repo, records } = createInMemoryUserRepo();
    const getPrimaryVerifiedEmail = vi.fn(async () => 'new.author@example.com');
    const authProvider: AuthProviderPort = {
      getAuthenticatedSubject: async () => 'user_clerk_new',
      getPrimaryVerifiedEmail,
    };

    const first = await requireCurrentUserWithDeps({ authProvider, userRepository: repo });
    const second = await requireCurrentUserWithDeps({ authProvider, userRepository: repo });

    expect(first.id).toBe(second.id);
    expect(records).toHaveLength(1);
    expect(getPrimaryVerifiedEmail).toHaveBeenCalledTimes(1);
  });

  it('never merges accounts sharing an email across distinct Clerk subjects', async () => {
    const { repo, records } = createInMemoryUserRepo();
    const sharedEmail = 'shared@example.com';

    const userA = await requireCurrentUserWithDeps({
      authProvider: {
        getAuthenticatedSubject: async () => 'user_clerk_A',
        getPrimaryVerifiedEmail: async () => sharedEmail,
      },
      userRepository: repo,
    });

    const userB = await requireCurrentUserWithDeps({
      authProvider: {
        getAuthenticatedSubject: async () => 'user_clerk_B',
        getPrimaryVerifiedEmail: async () => sharedEmail,
      },
      userRepository: repo,
    });

    expect(userA.id).not.toBe(userB.id);
    expect(records).toHaveLength(2);
  });

  it('denies inactive (pending_deletion) and deleted local accounts without resurrecting them', async () => {
    const { repo } = createInMemoryUserRepo([
      {
        id: parseUserId(FIXED_UUIDS[0]),
        idpSubject: 'user_pending_del',
        email: 'pending@example.com',
        status: 'pending_deletion',
        createdAt: new Date('2026-11-26T00:00:00.000Z'),
      },
      {
        id: parseUserId(FIXED_UUIDS[1]),
        idpSubject: 'user_deleted_sub',
        email: null,
        status: 'deleted',
        createdAt: new Date('2026-11-26T00:00:00.000Z'),
      },
    ]);

    for (const [sub, expectedStatus] of [
      ['user_pending_del', 'pending_deletion'],
      ['user_deleted_sub', 'deleted'],
    ] as const) {
      const authProvider: AuthProviderPort = { getAuthenticatedSubject: async () => sub };
      const res = await resolveCurrentUser({ authProvider, userRepository: repo });
      expect(res).toEqual({ status: 'inactive_account', accountStatus: expectedStatus });
      expect(await currentUserWithDeps({ authProvider, userRepository: repo })).toBeNull();
      await expect(
        requireCurrentUserWithDeps({ authProvider, userRepository: repo }),
      ).rejects.toBeInstanceOf(InactiveAccountError);
    }
  });

  it('fails closed on provider and persistence errors instead of returning anonymous access', async () => {
    const { repo } = createInMemoryUserRepo();

    const failingProvider: AuthProviderPort = {
      getAuthenticatedSubject: async () => {
        throw new Error('Clerk JWKS unreachable');
      },
    };
    await expect(
      currentUserWithDeps({ authProvider: failingProvider, userRepository: repo }),
    ).rejects.toBeInstanceOf(IdentityInfrastructureError);

    const failingRepo: UserRepository = {
      findByIdpSubject: async () => {
        throw new Error('PostgreSQL connection refused');
      },
      findOrCreateByIdpSubject: async () => {
        throw new Error('PostgreSQL connection refused');
      },
    };
    await expect(
      currentUserWithDeps({
        authProvider: { getAuthenticatedSubject: async () => 'user_123' },
        userRepository: failingRepo,
      }),
    ).rejects.toBeInstanceOf(IdentityInfrastructureError);
  });
});
