import { clerkMiddleware } from '@clerk/nextjs/server';

/**
 * Next.js 16 proxy entrypoint integrating Clerk session context.
 * All routes remain public by default so the anonymous trial stays accessible;
 * protected Server Components, Route Handlers, and Server Actions enforce
 * authentication and ownership explicitly via server-side guards.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
