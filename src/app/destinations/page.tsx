'use client';

import { useState, useEffect } from 'react';
import { TikTokDestination } from '@/lib/types';

export default function DestinationsPage() {
  const [destinations, setDestinations] = useState<TikTokDestination[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [pixelId, setPixelId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [defaultEventName, setDefaultEventName] = useState('CompletePayment');
  const [testEventCode, setTestEventCode] = useState('');

  const loadDestinations = async () => {
    try {
      const res = await fetch('/api/v1/settings');
      const json = await res.json();
      setDestinations(json.destinations || []);
    } catch (err) {
      console.error('Failed to load destinations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDestinations();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/v1/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_destination',
          name: name || `TikTok Pixel (${pixelId})`,
          pixelId,
          accessToken,
          defaultEventName,
          testEventCode,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMsg('✓ TikTok Destination saved successfully!');
        setName('');
        setPixelId('');
        setAccessToken('');
        setTestEventCode('');
        await loadDestinations();
      } else {
        setStatusMsg(`Error: ${json.error}`);
      }
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto w-full space-y-8">
      {/* Header */}
      <div className="border-b border-slate-800/80 pb-5">
        <h1 className="text-2xl font-bold text-white tracking-tight">TikTok Destinations</h1>
        <p className="text-sm text-slate-400 mt-1">
          Configure your TikTok Pixel / Event Source IDs and Events API Server Access Tokens (No OAuth required)
        </p>
      </div>

      {/* Active Destinations Cards */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-white">Active TikTok Destinations</h2>
        {destinations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {destinations.map(d => (
              <div key={d.id} className="bg-[#111827] border border-slate-800/80 rounded-xl p-5 shadow-sm space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between font-sans">
                  <span className="font-bold text-white text-base">{d.name}</span>
                  <span className="badge badge-success text-[10px]">ACTIVE DESTINATION</span>
                </div>
                <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800/60">
                  <span>Pixel / Event Source ID:</span>
                  <span className="text-white font-bold">{d.pixelId}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Default Event Name:</span>
                  <span className="text-blue-400 font-bold">{d.defaultEventName}</span>
                </div>
                {d.testEventCode && (
                  <div className="flex justify-between text-slate-400">
                    <span>Sandbox Test Code:</span>
                    <span className="text-amber-400">{d.testEventCode}</span>
                  </div>
                )}
                <div className="text-[11px] text-slate-500 font-sans pt-1">
                  Token encrypted at rest with AES-256-GCM
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-6 text-center text-slate-400 text-xs">
            No TikTok Destinations configured yet. Add your first destination below to start receiving conversions.
          </div>
        )}
      </div>

      {/* Add New Destination Form */}
      <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-white">+ Add TikTok Destination</h2>
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1.5">Destination Label Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Nutra Scale US Pixel"
                className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5">TikTok Pixel ID (Required)</label>
              <input
                type="text"
                required
                value={pixelId}
                onChange={e => setPixelId(e.target.value)}
                placeholder="e.g. CP849201948201"
                className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1.5">Events API Access Token (Required)</label>
              <input
                type="password"
                required
                value={accessToken}
                onChange={e => setAccessToken(e.target.value)}
                placeholder="Paste Long-Lived Access Token from Events Manager"
                className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5">Default Event to Send</label>
              <select
                value={defaultEventName}
                onChange={e => setDefaultEventName(e.target.value)}
                className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="CompletePayment">CompletePayment (Standard Purchase)</option>
                <option value="Purchase">Purchase</option>
                <option value="PlaceAnOrder">PlaceAnOrder</option>
                <option value="InitiateCheckout">InitiateCheckout</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Optional Test Event Code (For TikTok Events Manager Sandbox Testing)</label>
            <input
              type="text"
              value={testEventCode}
              onChange={e => setTestEventCode(e.target.value)}
              placeholder="e.g. TEST84920 (Leave empty for live production traffic)"
              className="w-full md:w-1/2 bg-[#0d1322] border border-slate-700 rounded-lg px-3 py-2 text-slate-300 font-mono text-[11px]"
            />
          </div>

          <div className="pt-2 flex items-center justify-between">
            {statusMsg && (
              <span className={`font-semibold ${statusMsg.includes('✓') ? 'text-emerald-400' : 'text-rose-400'}`}>
                {statusMsg}
              </span>
            )}
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow-lg shadow-blue-600/20 transition-all ml-auto"
            >
              {saving ? 'Saving...' : 'Save TikTok Destination'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
