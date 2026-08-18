'use client';

import { useState, useEffect } from 'react';
import { TikTokDestination } from '@/lib/types';

export default function DestinationsPage() {
  const [destinations, setDestinations] = useState<TikTokDestination[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const handleStartEdit = (d: TikTokDestination) => {
    setEditingId(d.id);
    setName(d.name);
    setPixelId(d.pixelId);
    setAccessToken('');
    setDefaultEventName(d.defaultEventName || 'CompletePayment');
    setTestEventCode(d.testEventCode || '');
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setName('');
    setPixelId('');
    setAccessToken('');
    setDefaultEventName('CompletePayment');
    setTestEventCode('');
  };

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
          id: editingId || undefined,
          name: name || `TikTok Pixel (${pixelId})`,
          pixelId,
          accessToken,
          defaultEventName,
          testEventCode,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMsg({ text: editingId ? '✓ TikTok Destination updated successfully!' : '✓ TikTok Destination created successfully!' });
        handleCancelEdit();
        await loadDestinations();
      } else {
        setStatusMsg({ text: `Error: ${json.error}`, isError: true });
      }
    } catch (err: any) {
      setStatusMsg({ text: `Error: ${err.message}`, isError: true });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, destinationName: string) => {
    if (!confirm(`Are you sure you want to delete "${destinationName}"? Any affiliate channels connected to it will stop forwarding conversions.`)) {
      return;
    }

    try {
      const res = await fetch('/api/v1/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_destination',
          id,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMsg({ text: '✓ Destination deleted successfully.' });
        if (editingId === id) handleCancelEdit();
        await loadDestinations();
      } else {
        setStatusMsg({ text: `Error deleting destination: ${json.error}`, isError: true });
      }
    } catch (err: any) {
      setStatusMsg({ text: `Error: ${err.message}`, isError: true });
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto w-full space-y-8">
      {/* Header */}
      <div className="border-b border-slate-800/80 pb-5">
        <h1 className="text-2xl font-bold text-white tracking-tight">TikTok Destinations</h1>
        <p className="text-sm text-slate-400 mt-1">
          Manage your TikTok Pixel / Event Source IDs and Events API Server Access Tokens (No OAuth required)
        </p>
      </div>

      {/* Global Status Message */}
      {statusMsg && (
        <div className={`p-4 rounded-xl text-xs font-semibold border ${statusMsg.isError ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'}`}>
          {statusMsg.text}
        </div>
      )}

      {/* Active Destinations Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Active TikTok Destinations ({destinations.length})</h2>
          {destinations.length > 0 && (
            <button
              onClick={() => {
                handleCancelEdit();
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
              }}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
            >
              + Add New Pixel
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 text-xs">Loading destinations...</div>
        ) : destinations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {destinations.map(d => (
              <div key={d.id} className="bg-[#111827] border border-slate-800/80 rounded-xl p-5 shadow-sm space-y-3 font-mono text-xs relative group">
                <div className="flex items-center justify-between font-sans">
                  <span className="font-bold text-white text-base">{d.name}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStartEdit(d)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold rounded transition-all"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => handleDelete(d.id, d.name)}
                      className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[11px] font-semibold rounded transition-all"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
                <div className="flex justify-between text-slate-400 pt-2 border-t border-slate-800/60">
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
                <div className="text-[11px] text-slate-500 font-sans pt-1 flex items-center justify-between">
                  <span>Token: AES-256-GCM Encrypted</span>
                  <span className="badge badge-success text-[10px]">ACTIVE</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-8 text-center text-slate-400 text-xs space-y-2">
            <p className="font-bold text-slate-300">No TikTok Destinations configured yet.</p>
            <p>Add your first TikTok Pixel below to start receiving and forwarding S2S affiliate conversions.</p>
          </div>
        )}
      </div>

      {/* Add / Edit Destination Form */}
      <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-base font-bold text-white">
            {editingId ? `✏️ Edit Destination: ${name}` : '+ Add New TikTok Destination'}
          </h2>
          {editingId && (
            <button
              onClick={handleCancelEdit}
              className="text-xs text-slate-400 hover:text-white"
            >
              Cancel Edit
            </button>
          )}
        </div>

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
              <label className="block text-slate-300 font-medium mb-1.5">
                Events API Access Token {editingId ? '(Leave empty to keep existing token)' : '(Required)'}
              </label>
              <input
                type="password"
                required={!editingId}
                value={accessToken}
                onChange={e => setAccessToken(e.target.value)}
                placeholder={editingId ? '•••••••• (Enter new token only if updating)' : 'Paste Long-Lived Access Token from Events Manager'}
                className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5">Default Event Name</label>
              <select
                value={defaultEventName}
                onChange={e => setDefaultEventName(e.target.value)}
                className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="CompletePayment">CompletePayment (Default / Recommended)</option>
                <option value="Purchase">Purchase</option>
                <option value="PlaceAnOrder">PlaceAnOrder</option>
                <option value="InitiateCheckout">InitiateCheckout</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1.5">
              Sandbox Test Event Code (Optional)
            </label>
            <input
              type="text"
              value={testEventCode}
              onChange={e => setTestEventCode(e.target.value)}
              placeholder="e.g. TEST12345 (Found in TikTok Events Manager > Test Events tab)"
              className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500"
            />
            <p className="text-slate-500 text-[11px] mt-1">
              When provided, server events will be delivered to TikTok Sandbox Test tab for instant live verification.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg shadow-md shadow-blue-600/20 transition-all"
            >
              {saving ? 'Saving...' : editingId ? '💾 Update Destination' : '✓ Save Destination'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
