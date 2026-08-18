'use client';

import { useState, useEffect } from 'react';
import { CanonicalConversion, RawInboundEvent, DeliveryAttempt, Pixel, NetworkAccount } from '@/lib/types';

interface ConversionDetailResponse {
  conversion: CanonicalConversion;
  rawEvent?: RawInboundEvent;
  deliveryAttempts: DeliveryAttempt[];
  pixel?: Pixel;
  networkAccount?: NetworkAccount;
  journey: Array<{
    step: number;
    title: string;
    status: string;
    timestamp: string;
    details: string;
    isSuccess: boolean;
  }>;
}

export default function ConversionsPage() {
  const [conversions, setConversions] = useState<CanonicalConversion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversionDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [networkFilter, setNetworkFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const loadConversions = async () => {
    try {
      const url = new URL('/api/v1/conversions', window.location.origin);
      if (networkFilter !== 'all') url.searchParams.set('network', networkFilter);
      if (statusFilter !== 'all') url.searchParams.set('status', statusFilter);
      if (search) url.searchParams.set('search', search);

      const res = await fetch(url.toString());
      const data = await res.json();
      setConversions(data.conversions || []);
    } catch (err) {
      console.error('Failed to fetch conversions:', err);
    }
  };

  useEffect(() => {
    loadConversions();
    const interval = setInterval(loadConversions, 8000);
    return () => clearInterval(interval);
  }, [networkFilter, statusFilter, search]);

  const handleOpenDebugger = async (id: string) => {
    setSelectedId(id);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/v1/conversions/${id}`);
      const data = await res.json();
      setDetail(data);
    } catch (err) {
      console.error('Failed to load conversion detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Conversions & Live Debugger</h1>
          <p className="text-sm text-slate-400 mt-1">
            Complete transaction journey from Affiliate S2S Postback to TikTok Events API delivery
          </p>
        </div>

        <button
          onClick={loadConversions}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 self-start md:self-auto"
        >
          ↻ Refresh Ledger
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-4 flex flex-wrap items-center gap-3 text-xs">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search Order ID, Click ID (ttclid), Campaign, or Offer..."
            className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>

        <select
          value={networkFilter}
          onChange={e => setNetworkFilter(e.target.value)}
          className="bg-[#0d1322] border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Networks</option>
          <option value="maxweb">MaxWeb</option>
          <option value="buygoods">BuyGoods</option>
          <option value="digistore24">Digistore24</option>
          <option value="clickbank">ClickBank</option>
        </select>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-[#0d1322] border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Delivery Statuses</option>
          <option value="accepted">Accepted by TikTok</option>
          <option value="queued">Queued in Outbox</option>
          <option value="unattributed">Unattributed (Missing Click ID)</option>
          <option value="failed_retryable">Retrying (Backoff)</option>
          <option value="failed_permanent">Permanent Error</option>
        </select>
      </div>

      {/* Conversions Table */}
      <div className="bg-[#111827] border border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0d1322] text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800/80">
              <tr>
                <th className="py-3 px-4">Time</th>
                <th className="py-3 px-4">Network</th>
                <th className="py-3 px-4">Transaction ID</th>
                <th className="py-3 px-4">Event</th>
                <th className="py-3 px-4 text-right">Commission</th>
                <th className="py-3 px-4">Click ID (ttclid)</th>
                <th className="py-3 px-4">Campaign</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Diagnostic</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {conversions.length > 0 ? (
                conversions.map(c => (
                  <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      {new Date(c.receivedAt).toLocaleTimeString()}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="badge badge-info uppercase text-[10px]">
                        {c.network}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-white">
                      {c.transactionId}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1">
                        <span className={`badge ${c.eventType === 'refund' ? 'badge-danger' : c.eventType === 'upsell' ? 'badge-warning' : 'badge-success'} uppercase text-[10px]`}>
                          {c.eventType}
                        </span>
                        {c.targetEventName && c.status !== 'unattributed' && (
                          <span className="text-[10px] text-blue-400 font-mono">
                            &rarr; {c.targetEventName}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400">
                      {c.commissionAmount !== null && c.commissionAmount !== undefined
                        ? `$${c.commissionAmount.toFixed(2)}`
                        : '—'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] max-w-[150px] truncate text-slate-400">
                      {c.clickId || <span className="text-amber-400/80 italic">Missing ttclid</span>}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-blue-300">
                      Direct Linking
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`badge ${
                        c.status === 'accepted'
                          ? 'badge-success'
                          : c.status === 'unattributed'
                          ? 'badge-warning'
                          : c.status === 'queued'
                          ? 'badge-info'
                          : 'badge-danger'
                      }`}>
                        {c.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleOpenDebugger(c.id)}
                        className="px-2.5 py-1 rounded bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 hover:text-blue-300 font-semibold border border-blue-500/30 transition-colors"
                      >
                        Inspect Flow
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-slate-400">
                    No conversion records matching criteria. Run a simulation to inspect live transaction flow.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Conversion Debugger Modal */}
      {selectedId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-700 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-[#0d1322]">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">Conversion Journey Debugger</h3>
                  <span className="badge badge-info uppercase text-[10px]">
                    {detail?.conversion.network}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  Transaction: {detail?.conversion.transactionId} &bull; Idempotency: {detail?.conversion.idempotencyKey.substring(0, 16)}...
                </p>
              </div>

              <button
                onClick={() => setSelectedId(null)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {loadingDetail ? (
                <div className="py-12 text-center text-slate-400 text-sm">Loading complete audit trail...</div>
              ) : detail ? (
                <>
                  {/* Step-by-Step Visual Journey */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Attribution & Dispatch Steps
                    </h4>

                    <div className="space-y-2.5">
                      {detail.journey.map(step => (
                        <div
                          key={step.step}
                          className="p-3.5 rounded-xl bg-[#0d1322] border border-slate-800 flex items-start gap-3.5"
                        >
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                            step.isSuccess ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          }`}>
                            {step.isSuccess ? '✓' : '!'}
                          </div>
                          <div className="flex-1 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-white text-sm">{step.title}</span>
                              <span className="text-slate-400 text-[11px] font-mono">
                                {new Date(step.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-slate-300 mt-1">{step.details}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Delivery Attempts & TikTok Diagnostics */}
                  {detail.deliveryAttempts.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        TikTok Events API v1.3 Diagnostics
                      </h4>
                      {detail.deliveryAttempts.map(attempt => (
                        <div key={attempt.id} className="p-3 bg-[#0d1322] border border-slate-800 rounded-lg text-xs space-y-2 font-mono">
                          <div className="flex items-center justify-between text-slate-300">
                            <span>Status: HTTP {attempt.statusCode}</span>
                            <span className="text-emerald-400 font-bold">Latency: {attempt.latencyMs}ms</span>
                          </div>
                          <div className="bg-black/40 p-2.5 rounded border border-slate-900 overflow-x-auto text-[11px] text-slate-300">
                            {JSON.stringify(attempt.responseBody, null, 2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Raw Inbound Ledger Record */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Raw Inbound Postback Payload (Immutable Ledger)
                    </h4>
                    <div className="bg-[#0d1322] p-3 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto">
                      {detail.rawEvent ? (
                        <pre>{JSON.stringify(JSON.parse(detail.rawEvent.rawPayload), null, 2)}</pre>
                      ) : (
                        <span>No raw payload log attached</span>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-[#0d1322] flex justify-end">
              <button
                onClick={() => setSelectedId(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg"
              >
                Close Debugger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
