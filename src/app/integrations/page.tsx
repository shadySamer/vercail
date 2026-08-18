'use client';

import { useState, useEffect } from 'react';
import { TikTokDestination, AffiliateIntegration, ValueStrategy, NetworkType } from '@/lib/types';
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
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);

  // New Channel Modal / Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNetwork, setNewNetwork] = useState<NetworkType>('maxweb');
  const [newName, setNewName] = useState('');
  const [newDestinationId, setNewDestinationId] = useState('');
  const [newEventName, setNewEventName] = useState('CompletePayment');
  const [newValueStrategy, setNewValueStrategy] = useState<ValueStrategy>('commission');
  const [creating, setCreating] = useState(false);

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/v1/settings');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
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
        setStatusMsg({ text: '✓ Routing & Value strategy updated successfully!' });
        await loadSettings();
      } else {
        setStatusMsg({ text: `Error: ${json.error}`, isError: true });
      }
    } catch (err: any) {
      setStatusMsg({ text: `Error: ${err.message}`, isError: true });
    } finally {
      setSavingId(null);
    }
  };

  const handleRegenerateToken = async (integrationId: string, name: string) => {
    if (!confirm(`Regenerate security token for "${name}"? You will need to update the Postback URL in your network dashboard.`)) {
      return;
    }

    try {
      const res = await fetch('/api/v1/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'regenerate_token',
          integrationId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMsg({ text: '✓ Secret token regenerated successfully.' });
        await loadSettings();
      }
    } catch (err: any) {
      setStatusMsg({ text: `Error: ${err.message}`, isError: true });
    }
  };

  const handleDeleteIntegration = async (integrationId: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? Incoming postbacks to this token will no longer be processed.`)) {
      return;
    }

    try {
      const res = await fetch('/api/v1/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_integration',
          id: integrationId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMsg({ text: '✓ Channel deleted successfully.' });
        await loadSettings();
      }
    } catch (err: any) {
      setStatusMsg({ text: `Error: ${err.message}`, isError: true });
    }
  };

  const handleCreateIntegration = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setStatusMsg(null);

    try {
      const res = await fetch('/api/v1/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_integration',
          network: newNetwork,
          name: newName || `${newNetwork.toUpperCase()} S2S Channel`,
          destinationId: newDestinationId || undefined,
          eventName: newEventName,
          valueStrategy: newValueStrategy,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setStatusMsg({ text: '✓ New Affiliate Channel created successfully!' });
        setShowAddForm(false);
        setNewName('');
        await loadSettings();
      } else {
        setStatusMsg({ text: `Error: ${json.error}`, isError: true });
      }
    } catch (err: any) {
      setStatusMsg({ text: `Error: ${err.message}`, isError: true });
    } finally {
      setCreating(false);
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

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg border border-slate-700 transition-all shrink-0"
          >
            {showAddForm ? '✕ Close Form' : '+ Add Channel'}
          </button>
          <Link
            href="/destinations"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-blue-600/20 transition-all shrink-0"
          >
            Manage TikTok Destinations &rarr;
          </Link>
        </div>
      </div>

      {/* Global Status Message */}
      {statusMsg && (
        <div className={`p-4 rounded-xl text-xs font-semibold border ${statusMsg.isError ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'}`}>
          {statusMsg.text}
        </div>
      )}

      {/* Add New Channel Modal/Form */}
      {showAddForm && (
        <div className="bg-[#111827] border border-blue-500/40 rounded-xl p-6 shadow-lg space-y-4">
          <h2 className="text-base font-bold text-white">+ Create New Affiliate S2S Channel</h2>
          <form onSubmit={handleCreateIntegration} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">Affiliate Network</label>
                <select
                  value={newNetwork}
                  onChange={e => setNewNetwork(e.target.value as NetworkType)}
                  className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="maxweb">MaxWeb</option>
                  <option value="buygoods">BuyGoods</option>
                  <option value="digistore24">Digistore24</option>
                  <option value="clickbank">ClickBank</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">Channel Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder={`e.g. ${newNetwork.toUpperCase()} Main Account`}
                  className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">Assign TikTok Destination</label>
                <select
                  value={newDestinationId}
                  onChange={e => setNewDestinationId(e.target.value)}
                  className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Select Destination --</option>
                  {data?.destinations.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.pixelId})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">TikTok Event Name</label>
                <select
                  value={newEventName}
                  onChange={e => setNewEventName(e.target.value)}
                  className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="CompletePayment">CompletePayment (Recommended)</option>
                  <option value="Purchase">Purchase</option>
                  <option value="PlaceAnOrder">PlaceAnOrder</option>
                  <option value="InitiateCheckout">InitiateCheckout</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">Event Value Strategy</label>
                <select
                  value={newValueStrategy}
                  onChange={e => setNewValueStrategy(e.target.value as ValueStrategy)}
                  className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="commission">Commission Payout (Exact Net Profit)</option>
                  <option value="gross">Gross Order Amount (Cart Total)</option>
                  <option value="none">None (Zero / Omit Value)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={creating}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg shadow-md shadow-blue-600/20"
              >
                {creating ? 'Creating...' : '✓ Create Channel'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* No destinations warning */}
      {data && data.destinations.length === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between text-xs text-amber-200">
          <span>
            ⚠️ You have not configured any TikTok Destinations yet. Please add a TikTok Destination so your conversions can be delivered.
          </span>
          <Link href="/destinations" className="font-bold underline text-amber-300">
            Add Destination Now
          </Link>
        </div>
      )}

      {/* Network Cards */}
      <div className="space-y-6">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-xs">Loading affiliate integrations...</div>
        ) : (data?.integrations || []).length > 0 ? (
          data?.integrations.map(net => (
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
                  <button
                    onClick={() => handleRegenerateToken(net.id, net.name)}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded border border-slate-700"
                    title="Regenerate secret token"
                  >
                    🔄 Token
                  </button>
                  <button
                    onClick={() => handleDeleteIntegration(net.id, net.name)}
                    className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] rounded border border-rose-500/30"
                    title="Delete channel"
                  >
                    🗑️
                  </button>
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
                    Example: <span className="text-slate-400 break-all">{net.exampleUrl}</span>
                  </p>
                </div>

                {/* Step B: S2S Postback URL */}
                <div className="p-4 bg-[#0d1322] border border-slate-800 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-blue-400">Step B: S2S Postback URL for {net.name}</span>
                    <button
                      onClick={() => copyToClipboard(net.postbackUrl, `pb-${net.id}`)}
                      className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold"
                    >
                      {copiedId === `pb-${net.id}` ? '✓ Copied' : 'Copy Postback URL'}
                    </button>
                  </div>
                  <p className="text-slate-400">
                    Paste this S2S Postback URL into {net.name} Postback / IPN Settings:
                  </p>
                  <div className="bg-black/60 p-2.5 rounded border border-slate-800 font-mono text-slate-300 text-[11px] break-all select-all">
                    {net.postbackUrl}
                  </div>
                  <p className="text-slate-500 text-[11px] pt-1">
                    Token: <span className="text-slate-400 font-mono">{net.secretToken}</span>
                  </p>
                </div>
              </div>

              {/* Destination & Value Strategy Assignment Controls */}
              <div className="p-4 bg-[#0d1322] border border-slate-800 rounded-lg text-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-300">Routing & Event Configuration</span>
                  <button
                    onClick={() => handleUpdateRouting(net.id)}
                    disabled={savingId === net.id}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded shadow transition-all"
                  >
                    {savingId === net.id ? 'Saving...' : '💾 Save Settings'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Destination Picker */}
                  <div>
                    <label className="block text-slate-400 mb-1">Target TikTok Destination</label>
                    <select
                      id={`dest-sel-${net.id}`}
                      defaultValue={net.destinationId || ''}
                      className="w-full bg-[#111827] border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="">-- No Destination (Hold Conversions) --</option>
                      {data?.destinations.map(dest => (
                        <option key={dest.id} value={dest.id}>
                          {dest.name} ({dest.pixelId})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Single Source of Truth Event Name */}
                  <div>
                    <label className="block text-slate-400 mb-1">TikTok Event Name</label>
                    <select
                      id={`event-sel-${net.id}`}
                      defaultValue={net.eventName || 'CompletePayment'}
                      className="w-full bg-[#111827] border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="CompletePayment">CompletePayment (Default)</option>
                      <option value="Purchase">Purchase</option>
                      <option value="PlaceAnOrder">PlaceAnOrder</option>
                      <option value="InitiateCheckout">InitiateCheckout</option>
                    </select>
                  </div>

                  {/* Explicit Value Strategy */}
                  <div>
                    <label className="block text-slate-400 mb-1">Event Value Strategy</label>
                    <select
                      id={`val-sel-${net.id}`}
                      defaultValue={net.valueStrategy || 'commission'}
                      className="w-full bg-[#111827] border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="commission">Commission Payout (Exact Net Profit)</option>
                      <option value="gross">Gross Order Amount (Cart Total)</option>
                      <option value="none">None (Zero / Omit Value)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-8 text-center text-slate-400 text-xs space-y-3">
            <p className="font-bold text-slate-300">No affiliate channels configured yet.</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-semibold"
            >
              + Create Your First Channel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
