'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface DashboardMetrics {
  totalPostbacks: number;
  totalConversions: number;
  attributedConversions: number;
  unattributedConversions: number;
  acceptedDeliveries: number;
  failedDeliveries: number;
  duplicateCount: number;
  grossCommission: number;
  refundedCommission: number;
  netCommission: number;
  attributionRate: number;
  deliveryRate: number;
  networks: Array<{
    network: string;
    accountName: string;
    totalConversions: number;
    initialSales: number;
    upsells: number;
    refunds: number;
    grossCommission: number;
    refundedCommission: number;
    netCommission: number;
    acceptedByTikTok: number;
    missingClickId: number;
    deliveryRate: number;
  }>;
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/v1/analytics');
      const data = await res.json();
      setMetrics(data);
    } catch (err) {
      console.error('Failed to load metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Direct Linking S2S Hub</h1>
          <p className="text-sm text-slate-400 mt-1">
            Server-to-Server Affiliate Conversion Hub for TikTok Ads
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/destinations"
            className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all"
          >
            + TikTok Destinations
          </Link>

          <Link
            href="/integrations"
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
          >
            Postbacks & Linking Setup &rarr;
          </Link>
        </div>
      </div>

      {/* Pure Direct Linking Workflow Path */}
      <div className="bg-[#111827] border border-blue-500/20 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-xs">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-sm shrink-0">
            ⚡
          </div>
          <div>
            <span className="font-bold text-white">Pure Direct Linking Architecture: </span>
            <span className="text-slate-300">
              Traffic goes directly from TikTok Ad to Affiliate Offer without redirects. Platform ingests S2S postbacks upon sale, cleans <code className="text-emerald-400 bg-black/40 px-1 py-0.5 rounded">ttclid</code>, and delivers the selected conversion event to TikTok Events API.
            </span>
          </div>
        </div>

        <Link
          href="/integrations"
          className="text-xs font-bold text-blue-400 hover:text-blue-300 underline shrink-0"
        >
          View Parameters & Postbacks
        </Link>
      </div>

      {/* Primary Authoritative Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Net Commission */}
        <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Confirmed Commission</span>
            <span className="badge badge-success text-[10px]">Net Payout</span>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-emerald-400">
              ${metrics ? metrics.netCommission.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
            </span>
          </div>
          <p className="text-[12px] text-slate-400 mt-2">
            Gross: ${metrics?.grossCommission.toFixed(2) || '0.00'} | Refunds: -${metrics?.refundedCommission.toFixed(2) || '0.00'}
          </p>
        </div>

        {/* Conversions Received */}
        <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Conversions Received</span>
            <span className="text-blue-400 text-xs font-bold font-mono">S2S Events</span>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-white">
              {metrics ? metrics.totalConversions : 0}
            </span>
          </div>
          <p className="text-[12px] text-slate-400 mt-2">
            {metrics?.attributedConversions || 0} Attributed &bull; {metrics?.unattributedConversions || 0} Missing Click ID
          </p>
        </div>

        {/* TikTok Delivery Rate */}
        <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>TikTok Delivery Rate</span>
            <span className="badge badge-info text-[10px]">Events API v1.3</span>
          </div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-3xl font-extrabold text-blue-400">
              {metrics?.deliveryRate || 100}%
            </span>
            <span className="text-xs font-semibold text-slate-400">
              Accepted: {metrics?.acceptedDeliveries || 0}
            </span>
          </div>
          <p className="text-[12px] text-slate-400 mt-2">
            Deduplicated by Transaction ID & Order Item ID
          </p>
        </div>

        {/* Duplicates Suppressed */}
        <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Duplicates Blocked</span>
            <span className="badge badge-warning text-[10px]">DB Unique Key</span>
          </div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-3xl font-extrabold text-amber-400">
              {metrics?.duplicateCount || 0}
            </span>
            <span className="text-xs text-slate-400">
              Suppressed bursts
            </span>
          </div>
          <p className="text-[12px] text-slate-400 mt-2">
            Guarantees 0 duplicate conversion events to TikTok
          </p>
        </div>
      </div>

      {/* Network Integrations Breakdown Table */}
      <div className="bg-[#111827] border border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">Affiliate Channels Breakdown</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Live S2S performance across MaxWeb, BuyGoods, Digistore24, and ClickBank
            </p>
          </div>

          <Link href="/conversions" className="text-xs text-blue-400 hover:text-blue-300 font-medium">
            Open Conversions Debugger &rarr;
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0d1322] text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800/80">
              <tr>
                <th className="py-3 px-4">Network</th>
                <th className="py-3 px-4">Channel Name</th>
                <th className="py-3 px-4 text-center">Total Conversions</th>
                <th className="py-3 px-4 text-center">Sales / Upsells</th>
                <th className="py-3 px-4 text-center">Missing ttclid</th>
                <th className="py-3 px-4 text-right">Net Commission</th>
                <th className="py-3 px-4 text-center">TikTok Delivery</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {metrics && metrics.networks.length > 0 ? (
                metrics.networks.map((net, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="badge badge-info text-[11px] uppercase">
                        {net.network}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-white">
                      {net.accountName}
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold text-white font-mono">
                      {net.totalConversions}
                    </td>
                    <td className="py-3.5 px-4 text-center text-slate-400 font-mono">
                      {net.initialSales} / <span className="text-emerald-400 font-bold">{net.upsells}</span>
                      {net.refunds > 0 && <span className="text-rose-400 ml-1">(-{net.refunds})</span>}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono">
                      {net.missingClickId > 0 ? (
                        <span className="text-amber-400 font-bold">{net.missingClickId}</span>
                      ) : (
                        <span className="text-slate-500">0</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-400 font-mono">
                      ${net.netCommission.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="badge badge-success">
                        {net.deliveryRate}% Accepted
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    No conversion traffic recorded yet. Connect your network Postback URL to begin tracking.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
