'use client';

import { useState, useEffect } from 'react';
import { TikTokDestination, AffiliateIntegration, ValueStrategy } from '@/lib/types';
import Link from 'next/link';

interface SettingsData {
  destinations: TikTokDestination[];
  integrations: Array<AffiliateIntegration & {
    postbackUrl: string;
    clickIdMacro: string;
    exampleUrl: string;
    assignedDestination?: TikTokDestination;
  }>;
}

export default function IntegrationsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ id: string; text: string; isError?: boolean } | null>(null);

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/v1/settings');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleUpdateRouting = async (integrationId: string) => {
    const destSel = document.getElementById(`dest-sel-${integrationId}`) as HTMLSelectElement;
    const eventSel = document.getElementById(`event-sel-${integrationId}`) as HTMLSelectElement;
    const valueSel = document.getElementById(`val-sel-${integrationId}`) as HTMLSelectElement;

    setSavingId(integrationId);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/v1/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_integration',
          integrationId,
          destinationId: destSel?.value || undefined,
          eventName: eventSel?.value || undefined,
          valueStrategy: (valueSel?.value || 'commission') as ValueStrategy,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setStatusMsg({ id: integrationId, text: '✓ Routing & Value settings saved!' });
        await loadSettings();
      } else {
        setStatusMsg({ id: integrationId, text: `Error: ${json.error}`, isError: true });
      }
    } catch (err: any) {
      setStatusMsg({ id: integrationId, text: `Error: ${err.message}`, isError: true });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto w-full space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Affiliate Integrations & Postback Hub</h1>
          <p className="text-sm text-slate-400 mt-1">
            Get your Direct Linking parameters and copy S2S Postback URLs for MaxWeb, BuyGoods, Digistore24, and ClickBank
          </p>
        </div>

        <Link
          href="/destinations"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-blue-600/20 transition-all shrink-0"
        >
          Manage TikTok Destinations &rarr;
        </Link>
      </div>

      {/* No destinations warning */}
      {data?.destinations.length === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between text-xs text-amber-200">
          <span>
            ⚠️ You have not configured any TikTok Destinations yet. Please add a TikTok Destination so your conversions can be delivered.
          </span>
          <Link href="/destinations" className="font-bold underline text-amber-300">
            Add Destination Now
          </Link>
        </div>
      )}

      {/* 4 Network Cards */}
      <div className="space-y-6">
        {data?.integrations.map(net => (
          <div
            key={net.id}
            className="bg-[#111827] border border-slate-800/80 rounded-xl p-5 shadow-sm space-y-5"
          >
            {/* Top Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-blue-600/10 border border-blue-500/30 flex items-center justify-center font-bold text-blue-400 uppercase text-xs">
                  {net.network.substring(0, 3)}
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">{net.name}</h3>
                  <p className="text-xs text-slate-400 uppercase">{net.network} Direct S2S Channel</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {net.destinationId ? (
                  <span className="badge badge-success text-[10px]">
                    ROUTED TO: {net.assignedDestination?.name || 'Assigned Destination'}
                  </span>
                ) : (
                  <span className="badge badge-danger text-[10px]">
                    NO DESTINATION ASSIGNED
                  </span>
                )}
              </div>
            </div>

            {/* Direct Linking Macro & Postback URL */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              {/* Step A: Click ID instruction with ttclid wrapper */}
              <div className="p-4 bg-[#0d1322] border border-slate-800 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-400">Step A: Add to your Affiliate Link in TikTok Ads</span>
                  <button
                    onClick={() => copyToClipboard(net.clickIdMacro, `macro-${net.id}`)}
                    className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold"
                  >
                    {copiedId === `macro-${net.id}` ? '✓ Copied' : 'Copy Parameter'}
                  </button>
                </div>
                <p className="text-slate-400">
                  Append this exact parameter to the end of your original affiliate link in TikTok Ads Manager:
                </p>
                <div className="bg-black/60 p-2.5 rounded border border-slate-800 font-mono text-emerald-400 text-xs select-all">
                  {net.clickIdMacro}
                </div>
                <p className="text-slate-500 text-[11px] pt-1">
                  Example: <span className="font-mono text-slate-400 break-all">{net.exampleUrl}</span>
                </p>
              </div>

              {/* Step B: Network S2S Postback URL */}
              <div className="p-4 bg-[#0d1322] border border-slate-800 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-blue-400">Step B: Paste Postback URL in {net.network.toUpperCase()}</span>
                  <button
                    onClick={() => copyToClipboard(net.postbackUrl, `post-${net.id}`)}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold"
                  >
                    {copiedId === `post-${net.id}` ? '✓ Copied URL' : 'Copy Postback URL'}
                  </button>
                </div>
                <p className="text-slate-400">
                  Copy and paste this URL into your {net.network.toUpperCase()} Postback / Pixel Settings:
                </p>
                <div className="bg-black/60 p-2.5 rounded border border-slate-800 font-mono text-slate-300 text-[11px] break-all select-all">
                  {net.postbackUrl}
                </div>
              </div>
            </div>

            {/* Step C: Explicit Destination, Event, and Value Routing */}
            <div className="pt-3 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                {/* 1. Target TikTok Destination */}
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Assigned TikTok Destination</label>
                  <select
                    defaultValue={net.destinationId || ''}
                    id={`dest-sel-${net.id}`}
                    className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- Select TikTok Destination --</option>
                    {data?.destinations.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.pixelId})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. TikTok Event Name */}
                <div>
                  <label className="block text-slate-400 font-medium mb-1">TikTok Event to Send</label>
                  <select
                    defaultValue={net.eventName || 'CompletePayment'}
                    id={`event-sel-${net.id}`}
                    className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="CompletePayment">CompletePayment (Purchase)</option>
                    <option value="Purchase">Purchase</option>
                    <option value="PlaceAnOrder">PlaceAnOrder</option>
                    <option value="InitiateCheckout">InitiateCheckout</option>
                  </select>
                </div>

                {/* 3. Value Strategy */}
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Conversion Value Strategy</label>
                  <select
                    defaultValue={net.valueStrategy || 'commission'}
                    id={`val-sel-${net.id}`}
                    className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="commission">Affiliate Commission Amount</option>
                    <option value="gross">Gross Customer Sale Value</option>
                    <option value="none">Do Not Send Value</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end md:self-auto shrink-0 pt-4 md:pt-0">
                {statusMsg?.id === net.id && (
                  <span className={`text-[11px] font-semibold ${statusMsg.isError ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {statusMsg.text}
                  </span>
                )}
                <button
                  onClick={() => handleUpdateRouting(net.id)}
                  disabled={savingId === net.id}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg border border-slate-700 shadow-sm transition-all"
                >
                  {savingId === net.id ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
