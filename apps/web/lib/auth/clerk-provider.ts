import { auth, clerkClient } from '@clerk/nextjs/server';
import type { AuthProviderPort } from './identity';

/**
 * Clerk implementation of `AuthProviderPort`.
 * Uses `auth()` per request and only queries Clerk Backend API for
 * verified primary email during first-time local user provisioning.
 */
export function createClerkAuthProvider(): AuthProviderPort {
  return {
    async getAuthenticatedSubject(): Promise<string | null> {
      const { userId } = await auth();
      return userId ?? null;
    },

    async getPrimaryVerifiedEmail(subject: string): Promise<string | null> {
      const client = await clerkClient();
      const user = await client.users.getUser(subject);
      const primaryEmail = user.emailAddresses.find(
        (email) =>
          email.id === user.primaryEmailAddressId && email.verification?.status === 'verified',
      );
      return primaryEmail?.emailAddress ?? null;
    },
  };
}
