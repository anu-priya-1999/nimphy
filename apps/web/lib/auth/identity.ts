import type { UserId } from '@nimphy/domain';
import type { AppUserStatus, UserRepository } from '@nimphy/persistence';

export interface AuthenticatedUser {
  readonly id: UserId;
  readonly idpSubject: string;
  readonly email: string | null;
}

export type CurrentUserResolution =
  | { readonly status: 'authenticated'; readonly user: AuthenticatedUser }
  | { readonly status: 'unauthenticated' }
  | { readonly status: 'inactive_account'; readonly accountStatus: AppUserStatus };

export class UnauthenticatedError extends Error {
  readonly code = 'ERR-AUTH-001' as const;
  readonly httpStatus = 401;

  constructor(message = 'Authentication is required') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

export class InactiveAccountError extends Error {
  readonly code = 'ERR-AUTH-001' as const;
  readonly httpStatus = 401;
  readonly accountStatus: AppUserStatus;

  constructor(accountStatus: AppUserStatus) {
    super(`Local user account is not active (status: ${accountStatus})`);
    this.name = 'InactiveAccountError';
    this.accountStatus = accountStatus;
  }
}

export class ForbiddenResourceError extends Error {
  readonly code = 'ERR-RES-001' as const;
  readonly httpStatus = 404;

  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'ForbiddenResourceError';
  }
}

export class IdentityInfrastructureError extends Error {
  readonly code = 'ERR-SYS-001' as const;
  readonly httpStatus = 503;
  readonly source: 'provider' | 'persistence';

  constructor(source: 'provider' | 'persistence', message: string) {
    super(message);
    this.name = 'IdentityInfrastructureError';
    this.source = source;
  }
}

export interface AuthProviderPort {
  getAuthenticatedSubject(): Promise<string | null>;
  getPrimaryVerifiedEmail?(subject: string): Promise<string | null>;
}

export interface IdentityDependencies {
  readonly authProvider: AuthProviderPort;
  readonly userRepository: UserRepository;
}

/**
 * Resolves the current Clerk subject to an active local `app_users` record.
 * - Unauthenticated access returns `{ status: 'unauthenticated' }`.
 * - Non-active local users (`pending_deletion`, `deleted`) are denied explicitly.
 * - Provider or persistence failures fail closed by throwing `IdentityInfrastructureError`.
 * - First-time provisioning fetches verified primary email only when no local row exists.
 */
export async function resolveCurrentUser(
  deps: IdentityDependencies,
): Promise<CurrentUserResolution> {
  let subject: string | null;
  try {
    subject = await deps.authProvider.getAuthenticatedSubject();
  } catch {
    throw new IdentityInfrastructureError('provider', 'Identity provider session check failed');
  }

  if (!subject) {
    return { status: 'unauthenticated' };
  }

  let existingUser;
  try {
    existingUser = await deps.userRepository.findByIdpSubject(subject);
  } catch {
    throw new IdentityInfrastructureError('persistence', 'Failed to query local user identity');
  }

  if (existingUser) {
    if (existingUser.status !== 'active') {
      return { status: 'inactive_account', accountStatus: existingUser.status };
    }

    return {
      status: 'authenticated',
      user: {
        id: existingUser.id,
        idpSubject: subject,
        email: existingUser.email,
      },
    };
  }

  let primaryVerifiedEmail: string | null = null;
  if (deps.authProvider.getPrimaryVerifiedEmail) {
    try {
      primaryVerifiedEmail = await deps.authProvider.getPrimaryVerifiedEmail(subject);
    } catch {
      throw new IdentityInfrastructureError(
        'provider',
        'Failed to retrieve verified profile from identity provider',
      );
    }
  }

  let provisioned;
  try {
    provisioned = await deps.userRepository.findOrCreateByIdpSubject({
      idpSubject: subject,
      email: primaryVerifiedEmail,
    });
  } catch {
    throw new IdentityInfrastructureError('persistence', 'Failed to provision local user identity');
  }

  if (provisioned.user.status !== 'active') {
    return { status: 'inactive_account', accountStatus: provisioned.user.status };
  }

  return {
    status: 'authenticated',
    user: {
      id: provisioned.user.id,
      idpSubject: subject,
      email: provisioned.user.email,
    },
  };
}

/**
 * Returns the active authenticated Nimphy user, or `null` when unauthenticated or inactive.
 * Infrastructure errors still throw so they are never confused with anonymous access.
 */
export async function currentUserWithDeps(
  deps: IdentityDependencies,
): Promise<AuthenticatedUser | null> {
  const resolution = await resolveCurrentUser(deps);
  if (resolution.status !== 'authenticated') {
    return null;
  }
  return resolution.user;
}

/**
 * Enforces an active authenticated Nimphy user, throwing explicit auth errors otherwise.
 */
export async function requireCurrentUserWithDeps(
  deps: IdentityDependencies,
): Promise<AuthenticatedUser> {
  const resolution = await resolveCurrentUser(deps);
  if (resolution.status === 'unauthenticated') {
    throw new UnauthenticatedError();
  }
  if (resolution.status === 'inactive_account') {
    throw new InactiveAccountError(resolution.accountStatus);
  }
  return resolution.user;
}
