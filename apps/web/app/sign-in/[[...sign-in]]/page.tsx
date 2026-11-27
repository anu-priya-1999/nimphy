import { SignIn } from '@clerk/nextjs';

export const dynamic = 'force-dynamic';

export default function SignInPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <SignIn />
    </main>
  );
}
