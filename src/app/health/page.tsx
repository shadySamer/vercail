'use client';

import { useState, useEffect } from 'react';
import { VerificationCapabilityMatrix, IntegrationHealth } from '@/lib/types';

interface HealthResponse {
  overallStatus: string;
  avgLatencyMs: number;
  integrationHealth: IntegrationHealth[];
  capabilityMatrix: VerificationCapabilityMatrix[];
}

export default function HealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadHealth = async () => {
    try {
      const res = await fetch('/api/v1/health');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to fetch health:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHealth();
    const interval = setInterval(loadHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Tracking Health & Capability Matrix</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time delivery rates, missing Click ID metrics, and verified network contract matrix
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="badge badge-success px-3 py-1 text-xs font-bold">
            Average S2S Latency: {data?.avgLatencyMs || 42}ms
          </span>
        </div>
      </div>

      {/* Health Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {data?.integrationHealth.map(h => (
          <div key={h.id} className="bg-[#111827] border border-slate-800/80 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white uppercase text-sm">{h.network}</span>
              <span className={`badge ${h.status === 'healthy' ? 'badge-success' : 'badge-warning'}`}>
                {h.status.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800">
              <div>
                <p className="text-slate-400">Postbacks</p>
                <p className="text-base font-bold text-white font-mono">{h.totalPostbacksReceived}</p>
              </div>
              <div>
                <p className="text-slate-400">Conversions</p>
                <p className="text-base font-bold text-emerald-400 font-mono">{h.totalConversionsProcessed}</p>
              </div>
              <div>
                <p className="text-slate-400">Attribution Rate</p>
                <p className="text-sm font-bold text-blue-400 font-mono">{h.attributionRate}%</p>
              </div>
              <div>
                <p className="text-slate-400">Delivery Rate</p>
                <p className="text-sm font-bold text-emerald-400 font-mono">{h.deliveryRate}%</p>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-800 flex justify-between">
              <span>Duplicates: <b className="text-slate-200">{h.duplicateCount}</b></span>
              <span>Missing ttclid: <b className="text-amber-400">{h.missingClickIdCount}</b></span>
            </div>
          </div>
        ))}
      </div>

      {/* Verified Capability Matrix Table */}
      <div className="bg-[#111827] border border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800/80">
          <h2 className="text-base font-bold text-white">Verified Integration Capability Matrix (Phase 0 Contract)</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Strict capability audit confirming direct linking, Click ID persistence, events, and security protocols
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0d1322] text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800/80">
              <tr>
                <th className="py-3 px-4">Network</th>
                <th className="py-3 px-4 text-center">Direct Linking</th>
                <th className="py-3 px-4 text-center">Click ID Persistence</th>
                <th className="py-3 px-4 text-center">S2S Postback</th>
                <th className="py-3 px-4 text-center">Purchase</th>
                <th className="py-3 px-4 text-center">Upsells</th>
                <th className="py-3 px-4 text-center">Rebills</th>
                <th className="py-3 px-4 text-center">Refunds</th>
                <th className="py-3 px-4 text-center">Security Verification</th>
                <th className="py-3 px-4">Implementation Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {data?.capabilityMatrix.map(m => (
                <tr key={m.network} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-white uppercase">{m.network}</td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="badge badge-success text-[10px]">{m.directLinking}</span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="badge badge-success text-[10px]">{m.clickIdPersistence}</span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="badge badge-success text-[10px]">{m.s2sPostback}</span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="badge badge-success text-[10px]">{m.purchaseEvent}</span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="badge badge-success text-[10px]">{m.upsellEvent}</span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="badge badge-success text-[10px]">{m.rebillEvent}</span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="badge badge-success text-[10px]">{m.refundEvent}</span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="badge badge-success text-[10px]">{m.signedSecurity}</span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-300 text-[11px]">
                    {m.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
