import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'AffiliateHub | TikTok S2S Direct Linking Attribution',
  description: 'Server-to-Server Affiliate Conversion Hub for TikTok Ads',
};

import LivePostbackNotifier from '@/components/LivePostbackNotifier';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col md:flex-row bg-[#090d16] text-slate-100 antialiased selection:bg-blue-600 selection:text-white">
        <LivePostbackNotifier />
        {/* Navigation Sidebar */}
        <aside className="w-full md:w-64 bg-[#0d1322] border-b md:border-b-0 md:border-r border-slate-800/80 flex flex-col shrink-0">
          {/* Brand Header */}
          <div className="p-5 border-b border-slate-800/60 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-600/30">
                A
              </div>
              <div>
                <h1 className="font-bold text-sm text-white tracking-wide">AffiliateHub</h1>
                <p className="text-[11px] text-slate-400">TikTok S2S Attribution</p>
              </div>
            </div>
            <span className="badge badge-success text-[10px]">DIRECT S2S</span>
          </div>

          {/* Primary Nav Links */}
          <nav className="flex-1 p-3 space-y-1 text-sm font-medium">
            <Link
              href="/"
              className="flex items-center px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <svg className="w-4 h-4 mr-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Dashboard
            </Link>

            <Link
              href="/destinations"
              className="flex items-center px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <svg className="w-4 h-4 mr-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              TikTok Destinations
            </Link>

            <Link
              href="/integrations"
              className="flex items-center px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <svg className="w-4 h-4 mr-3 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
              </svg>
              Affiliate Integrations
            </Link>

            <Link
              href="/conversions"
              className="flex items-center px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <svg className="w-4 h-4 mr-3 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              Conversions & Debugger
            </Link>

            <Link
              href="/health"
              className="flex items-center px-3 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <svg className="w-4 h-4 mr-3 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Tracking Health
            </Link>
          </nav>

          {/* Footer Info */}
          <div className="p-4 border-t border-slate-800/60 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Database Engine:</span>
              <span className="text-emerald-400 font-mono font-semibold">SQLite WAL (ACID)</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Idempotency:</span>
              <span className="text-blue-400 font-mono font-semibold">DB Unique Key</span>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
