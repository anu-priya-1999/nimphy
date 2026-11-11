import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nimphy — Author Royalty Estimation & Business Case Analysis',
  description:
    'Deterministic royalty calculations and grounded business case decision analysis for independent authors.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
