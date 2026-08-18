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

interface RecentConversion {
  id: string;
  network: string;
  transactionId: string;
  eventType: string;
  tiktokEventName: string;
  commissionAmount: number | null;
  grossAmount: number | null;
  currency: string | null;
  clickId?: string;
  status: string;
  receivedAt: string;
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recentConversions, setRecentConversions] = useState<RecentConversion[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMetricsAndActivity = async () => {
    try {
      const [resAnalytics, resConversions] = await Promise.all([
        fetch('/api/v1/analytics'),
        fetch('/api/v1/conversions?limit=8'),
      ]);

      if (resAnalytics.ok) {
        const data = await resAnalytics.json();
        setMetrics(data);
      }

      if (resConversions.ok) {
        const data = await resConversions.json();
        setRecentConversions(data.conversions || []);
      }
    } catch (err) {
      console.error('Failed to load metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetricsAndActivity();
    const interval = setInterval(fetchMetricsAndActivity, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">Direct Linking S2S Hub</h1>
            <span className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              LIVE PRODUCTION
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Server-to-Server Affiliate Conversion Hub &bull; Direct Linking to TikTok Ads Events API v1.3
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/simulator"
            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-1.5"
          >
            <span>⚡</span> Test S2S Postback
          </Link>

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
            Postbacks Setup &rarr;
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
          className="text-xs text-blue-400 hover:text-blue-300 font-semibold underline shrink-0"
        >
          View Tracking Links Setup &rarr;
        </Link>
      </div>

      {/* High-Level Conversion KPI Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="stat-card">
          <span className="text-xs text-slate-400 font-medium">Total S2S Postbacks</span>
          <div className="text-xl font-bold font-mono text-white mt-1">
            {metrics?.totalPostbacks ?? 0}
          </div>
          <span className="text-[11px] text-slate-500">Inbound notifications</span>
        </div>

        <div className="stat-card">
          <span className="text-xs text-slate-400 font-medium">Total Conversions</span>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
            {metrics?.totalConversions ?? 0}
          </div>
          <span className="text-[11px] text-slate-500">Recorded orders</span>
        </div>

        <div className="stat-card">
          <span className="text-xs text-slate-400 font-medium">Attribution Rate</span>
          <div className="text-xl font-bold font-mono text-blue-400 mt-1">
            {metrics?.attributionRate ?? 100}%
          </div>
          <span className="text-[11px] text-slate-500">With valid ttclid</span>
        </div>

        <div className="stat-card">
          <span className="text-xs text-slate-400 font-medium">TikTok Deliveries</span>
          <div className="text-xl font-bold font-mono text-indigo-400 mt-1">
            {metrics?.acceptedDeliveries ?? 0}
          </div>
          <span className="text-[11px] text-emerald-400 font-medium">
            {metrics?.deliveryRate ?? 100}% Success
          </span>
        </div>

        <div className="stat-card">
          <span className="text-xs text-slate-400 font-medium">Missing ttclid</span>
          <div className="text-xl font-bold font-mono text-amber-400 mt-1">
            {metrics?.unattributedConversions ?? 0}
          </div>
          <span className="text-[11px] text-slate-500">Skipped dispatch</span>
        </div>

        <div className="stat-card">
          <span className="text-xs text-slate-400 font-medium">Net Commission</span>
          <div className="text-xl font-bold font-mono text-emerald-300 mt-1">
            ${metrics ? metrics.netCommission.toFixed(2) : '0.00'}
          </div>
          <span className="text-[11px] text-slate-500">USD Realized</span>
        </div>
      </div>

      {/* LIVE INBOUND POSTBACK STREAM (Real-time Radar) */}
      <div className="bg-[#111827] border border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between bg-[#0d1322]/80">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Live Inbound Activity & TikTok Delivery Stream
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Auto-refreshes every 3s. Send a test from any network or browser and watch it appear live.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/simulator" className="text-xs text-emerald-400 hover:text-emerald-300 font-medium bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded">
              ⚡ Test Inbound Webhook
            </Link>
            <Link href="/conversions" className="text-xs text-blue-400 hover:text-blue-300 font-medium">
              View All Conversions &rarr;
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0a0f1d] text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800/80">
              <tr>
                <th className="py-3 px-4">Time</th>
                <th className="py-3 px-4">Network</th>
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">Event Type</th>
                <th className="py-3 px-4 text-right">Commission</th>
                <th className="py-3 px-4">TikTok Click ID (ttclid)</th>
                <th className="py-3 px-4 text-center">TikTok Events API Status</th>
                <th className="py-3 px-4 text-center">Diagnostics</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {recentConversions.length > 0 ? (
                recentConversions.map((conv) => (
                  <tr key={conv.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-400 text-[11px] whitespace-nowrap">
                      {new Date(conv.receivedAt).toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-4">
                      <span className="badge badge-info text-[10px] uppercase font-bold">
                        {conv.network}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-white">
                      {conv.transactionId}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-blue-300">
                      {conv.eventType} &rarr; <span className="text-white font-bold">{conv.tiktokEventName}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                      {conv.commissionAmount !== null && conv.commissionAmount !== undefined
                        ? `$${conv.commissionAmount.toFixed(2)} ${conv.currency || 'USD'}`
                        : '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] max-w-[160px] truncate">
                      {conv.clickId ? (
                        <span className="text-emerald-400" title={conv.clickId}>{conv.clickId}</span>
                      ) : (
                        <span className="text-amber-400/80 italic">Missing ttclid</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`badge ${
                        conv.status === 'accepted'
                          ? 'badge-success'
                          : conv.status === 'unattributed'
                          ? 'badge-warning'
                          : conv.status === 'queued'
                          ? 'badge-info'
                          : 'badge-danger'
                      }`}>
                        {conv.status === 'accepted' ? '✓ DELIVERED (200)' : conv.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Link
                        href={`/conversions?id=${conv.id}`}
                        className="px-2 py-1 rounded bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-[11px] font-semibold border border-blue-500/30"
                      >
                        Inspect Flow
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    Listening for live inbound postbacks... Send a test S2S postback to see it appear here live.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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

          <Link href="/integrations" className="text-xs text-blue-400 hover:text-blue-300 font-medium">
            Manage Channels &rarr;
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
