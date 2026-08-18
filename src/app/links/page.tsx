'use client';

import { useState, useEffect } from 'react';

interface Offer {
  id: string;
  network: string;
  name: string;
  targetUrl: string;
  defaultPixelId?: string;
  defaultPayout: number;
}

interface Pixel {
  id: string;
  pixelId: string;
  name: string;
  status: string;
}

interface TrackingLink {
  id: string;
  offerName: string;
  network: string;
  pixelName: string;
  campaignLabel: string;
  generatedDestinationUrl: string;
  createdAt: string;
}

interface ValidationResult {
  isReady: boolean;
  statusLabel: 'READY' | 'WARNING' | 'NOT READY';
  checks: Array<{
    id: string;
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
    recommendation?: string;
  }>;
}

export default function LinkBuilderPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [links, setLinks] = useState<TrackingLink[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState('');
  const [selectedPixelId, setSelectedPixelId] = useState('');
  const [campaign, setCampaign] = useState('TT-US-SCALE-01');
  const [adgroup, setAdgroup] = useState('AG-BROAD-35');
  const [ad, setAd] = useState('AD-HOOK-1');
  const [creative, setCreative] = useState('CR-ANIMATION');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [generating, setGenerating] = useState(false);

  const loadData = async () => {
    try {
      const [settingsRes, linksRes] = await Promise.all([
        fetch('/api/v1/settings'),
        fetch('/api/v1/tracking-links'),
      ]);
      const settingsData = await settingsRes.json();
      const linksData = await linksRes.json();

      setOffers(settingsData.offers || []);
      setPixels(settingsData.pixels || []);
      setLinks(linksData.links || []);

      if (settingsData.offers && settingsData.offers.length > 0 && !selectedOfferId) {
        setSelectedOfferId(settingsData.offers[0].id);
      }
      if (settingsData.pixels && settingsData.pixels.length > 0 && !selectedPixelId) {
        setSelectedPixelId(settingsData.pixels[0].pixelId);
      }
    } catch (err) {
      console.error('Failed to load Link Builder data:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleGenerateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const res = await fetch('/api/v1/tracking-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: selectedOfferId,
          pixelId: selectedPixelId,
          campaignLabel: campaign,
          adgroupLabel: adgroup,
          adLabel: ad,
          creativeLabel: creative,
        }),
      });

      const data = await res.json();
      if (data.link) {
        setValidation(data.validation);
        await loadData();
      }
    } catch (err) {
      console.error('Failed to generate link:', err);
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const selectedOffer = offers.find(o => o.id === selectedOfferId);

  return (
    <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Direct Link Builder & Smart Validator</h1>
        <p className="text-sm text-slate-400 mt-1">
          Generate production-ready TikTok Ads destination URLs with verified network macro tokens
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Link Generator Form */}
        <div className="lg:col-span-6 bg-[#111827] border border-slate-800/80 rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-white border-b border-slate-800/80 pb-3">
            1. Configure Direct Link
          </h2>

          <form onSubmit={handleGenerateLink} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Affiliate Offer
              </label>
              <select
                value={selectedOfferId}
                onChange={e => setSelectedOfferId(e.target.value)}
                className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {offers.map(o => (
                  <option key={o.id} value={o.id}>
                    [{o.network.toUpperCase()}] {o.name} (${o.defaultPayout} payout)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Target TikTok Pixel
              </label>
              <select
                value={selectedPixelId}
                onChange={e => setSelectedPixelId(e.target.value)}
                className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {pixels.map(p => (
                  <option key={p.id} value={p.pixelId}>
                    {p.name} ({p.pixelId})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Campaign Label
                </label>
                <input
                  type="text"
                  value={campaign}
                  onChange={e => setCampaign(e.target.value)}
                  placeholder="e.g. TT-US-SCALE-01"
                  className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Ad Group Label
                </label>
                <input
                  type="text"
                  value={adgroup}
                  onChange={e => setAdgroup(e.target.value)}
                  placeholder="e.g. AG-BROAD-35"
                  className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Ad Label
                </label>
                <input
                  type="text"
                  value={ad}
                  onChange={e => setAd(e.target.value)}
                  placeholder="e.g. AD-HOOK-1"
                  className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Creative Label
                </label>
                <input
                  type="text"
                  value={creative}
                  onChange={e => setCreative(e.target.value)}
                  placeholder="e.g. CR-ANIMATION"
                  className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={generating}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2"
            >
              {generating ? 'Validating & Building...' : 'Generate Direct Tracking URL'}
            </button>
          </form>
        </div>

        {/* Smart Pre-flight Validator Panel */}
        <div className="lg:col-span-6 bg-[#111827] border border-slate-800/80 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <h2 className="text-base font-bold text-white">2. Smart Pre-flight Validator</h2>
            {validation && (
              <span className={`badge ${validation.statusLabel === 'READY' ? 'badge-success' : validation.statusLabel === 'WARNING' ? 'badge-warning' : 'badge-danger'}`}>
                {validation.statusLabel}
              </span>
            )}
          </div>

          {validation ? (
            <div className="space-y-2.5">
              {validation.checks.map(check => (
                <div
                  key={check.id}
                  className="p-3 rounded-lg bg-[#0d1322] border border-slate-800 flex items-start justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${check.status === 'pass' ? 'bg-emerald-400' : check.status === 'warn' ? 'bg-amber-400' : 'bg-rose-400'}`}></span>
                      <span className="font-bold text-slate-200">{check.name}</span>
                    </div>
                    <p className="text-slate-400 mt-1">{check.message}</p>
                    {check.recommendation && (
                      <p className="text-amber-400/90 mt-1 font-medium">&bull; Tip: {check.recommendation}</p>
                    )}
                  </div>
                  <span className={`badge ${check.status === 'pass' ? 'badge-success' : check.status === 'warn' ? 'badge-warning' : 'badge-danger'} text-[10px]`}>
                    {check.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-800 rounded-lg">
              Click &quot;Generate Direct Tracking URL&quot; to run automated pre-flight checks on Click ID parameter injection, Pixel authorization, and postback routing.
            </div>
          )}
        </div>
      </div>

      {/* Generated Links History Table */}
      <div className="bg-[#111827] border border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-800/80">
          <h2 className="text-base font-bold text-white">Generated TikTok Destination URLs</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Copy and paste these exact links into TikTok Ads Manager destination URL field
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0d1322] text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800/80">
              <tr>
                <th className="py-3 px-4">Offer</th>
                <th className="py-3 px-4">Network</th>
                <th className="py-3 px-4">Pixel</th>
                <th className="py-3 px-4">Campaign</th>
                <th className="py-3 px-4">Destination URL (Ready for TikTok)</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {links.map(link => (
                <tr key={link.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-4 font-medium text-white">{link.offerName}</td>
                  <td className="py-3.5 px-4">
                    <span className="badge badge-info uppercase">{link.network}</span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-300">{link.pixelName}</td>
                  <td className="py-3.5 px-4 font-mono font-medium text-blue-300">{link.campaignLabel}</td>
                  <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400 max-w-md truncate">
                    {link.generatedDestinationUrl}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <button
                      onClick={() => copyToClipboard(link.generatedDestinationUrl, link.id)}
                      className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${copiedId === link.id ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'}`}
                    >
                      {copiedId === link.id ? '✓ Copied URL' : 'Copy URL'}
                    </button>
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
