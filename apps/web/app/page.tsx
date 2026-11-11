export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col justify-between p-6 sm:p-12 max-w-5xl mx-auto">
      <header className="py-6 border-b border-slate-200 flex justify-between items-center">
        <div>
          <span className="text-2xl font-bold tracking-tight text-slate-900">Nimphy</span>
          <span className="ml-2 px-2 py-0.5 text-xs font-semibold bg-sky-100 text-sky-800 rounded">
            v0.1.0-alpha (P0 / STEP-001)
          </span>
        </div>
        <nav className="text-sm font-medium text-slate-600">
          <span className="text-slate-400">Phase 0 Foundation</span>
        </nav>
      </header>

      <section className="my-auto py-12">
        {/* Illustrative-scenario disclaimer banner required by doc 03 §1 (P-07) and doc 22 §14 */}
        <div
          role="note"
          aria-label="Disclaimer"
          className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-sm leading-relaxed"
        >
          <div className="font-semibold flex items-center gap-1.5 mb-1">
            <svg
              className="w-4 h-4 text-amber-600"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>Illustrative Scenario Disclaimer</span>
          </div>
          <p>
            Projections, estimates, and calculations presented by Nimphy are for financial planning
            and scenario analysis purposes only. They do not constitute financial advice or
            guarantee future sales or commercial royalties.
          </p>
        </div>

        <div className="space-y-4">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            Author Royalty Estimation &amp; Business Case Analysis
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl leading-relaxed">
            Deterministic financial calculations paired with evidence-grounded analysis. Evaluate
            royalty distributions, break-even targets, and scenario modeling across marketplaces.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Deterministic Core</h2>
            <p className="text-xs text-slate-500">
              Pure I/O-free calculation engine with integer minor-unit money arithmetic and complete
              trace logs.
            </p>
          </div>
          <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Evidence &amp; Provenance</h2>
            <p className="text-xs text-slate-500">
              Explicit data lineage tracking for all assumptions, estimates, and verified publisher
              facts.
            </p>
          </div>
          <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Grounded Synthesis</h2>
            <p className="text-xs text-slate-500">
              Token-grounded AI executive memos validated against strictly verified calculation
              results.
            </p>
          </div>
        </div>
      </section>

      <footer className="py-6 border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-2">
        <p>
          &copy; {new Date().getFullYear()} Nimphy. Architecture Phase P0 / STEP-001 established.
        </p>
        <p className="text-slate-400">
          Modular Monolith &bull; Next.js App Router &bull; TypeScript Strict
        </p>
      </footer>
    </main>
  );
}
