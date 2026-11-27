import { createPgUserRepository } from '@nimphy/persistence';
import { getServerDatabasePool } from '../db/server-db';
import { createClerkAuthProvider } from './clerk-provider';
import {
  currentUserWithDeps,
  IdentityInfrastructureError,
  requireCurrentUserWithDeps,
  resolveCurrentUser,
  type AuthenticatedUser,
  type CurrentUserResolution,
  type IdentityDependencies,
} from './identity';

export {
  currentUserWithDeps,
  ForbiddenResourceError,
  IdentityInfrastructureError,
  InactiveAccountError,
  requireCurrentUserWithDeps,
  resolveCurrentUser,
  UnauthenticatedError,
  type AuthenticatedUser,
  type AuthProviderPort,
  type CurrentUserResolution,
  type IdentityDependencies,
} from './identity';
export { createClerkAuthProvider } from './clerk-provider';

function createDefaultIdentityDeps(): IdentityDependencies {
  let pool;
  try {
    pool = getServerDatabasePool();
  } catch {
    throw new IdentityInfrastructureError('persistence', 'Database connection is not configured');
  }

  return {
    authProvider: createClerkAuthProvider(),
    userRepository: createPgUserRepository(pool),
  };
}

/**
 * Resolves the currently authenticated Nimphy user using Clerk and PostgreSQL.
 * Returns `null` for unauthenticated visitors or inactive local accounts.
 * Throws `IdentityInfrastructureError` on provider or database failures.
 */
export async function currentUser(): Promise<AuthenticatedUser | null> {
  return currentUserWithDeps(createDefaultIdentityDeps());
}

/**
 * Resolves full authentication status without collapsing inactive accounts to `null`.
 */
export async function getCurrentUserResolution(): Promise<CurrentUserResolution> {
  return resolveCurrentUser(createDefaultIdentityDeps());
}

/**
 * Enforces an active authenticated Nimphy user on protected server operations.
 */
export async function requireCurrentUser(): Promise<AuthenticatedUser> {
  return requireCurrentUserWithDeps(createDefaultIdentityDeps());
}
