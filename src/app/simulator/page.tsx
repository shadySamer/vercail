'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function SimulatorPage() {
  const [network, setNetwork] = useState('maxweb');
  const [orderId, setOrderId] = useState(`ORD-${Math.floor(Math.random() * 899999 + 100000)}`);
  const [clickId, setClickId] = useState(`ttclid(E.C.P.demo_${Date.now().toString(36)})`);
  const [amount, setAmount] = useState('135.00');
  const [eventType, setEventType] = useState('purchase');
  const [campaign, setCampaign] = useState('TT-US-NUTR-01');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [burstStatus, setBurstStatus] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [host, setHost] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHost(window.location.host);
    }
  }, []);

  const getTestUrl = () => {
    const currentHost = host || 'your-domain.vercel.app';
    if (network === 'maxweb') {
      return `https://${currentHost}/api/v1/postbacks/maxweb/ws-master-01/mw_live_sec_884920?orderid=${orderId}&subid5=${encodeURIComponent(clickId)}&amount=${amount}&currency=USD`;
    }
    if (network === 'buygoods') {
      return `https://${currentHost}/api/v1/postbacks/buygoods/ws-master-01/bg_live_sec_119284?orderid=${orderId}&subid=${encodeURIComponent(clickId)}&amount=${amount}&currency=USD`;
    }
    if (network === 'digistore24') {
      return `https://${currentHost}/api/v1/postbacks/digistore24/ws-master-01/ds_live_sec_994821?transaction_id=${orderId}&cid=${encodeURIComponent(clickId)}&amount_affiliate=${amount}&currency=USD`;
    }
    return `https://${currentHost}/api/v1/postbacks/clickbank/ws-master-01/cb_live_sec_772910?receipt=${orderId}&extclid=${encodeURIComponent(clickId)}&amount=${amount}&currency=USD`;
  };

  const copyToClipboard = (text: string, type: 'url' | 'curl') => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    }
  };

  const handleSimulate = async (customParams: any = {}) => {
    setLoading(true);
    setResult(null);
    try {
      const payload = {
        network,
        orderId,
        clickId,
        amount: parseFloat(amount) || 100,
        eventType,
        campaign,
        ...customParams,
      };

      const res = await fetch('/api/v1/postbacks/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      setResult(json);
      // Generate new Order ID for next run
      if (!customParams.keepOrderId) {
        setOrderId(`ORD-${Math.floor(Math.random() * 899999 + 100000)}`);
      }
    } catch (err: any) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicateBurst = async () => {
    setLoading(true);
    setBurstStatus('Launching 10x simultaneous duplicate postbacks...');
    const fixedOrderId = `BURST-${Math.floor(Math.random() * 899999 + 100000)}`;
    const fixedClickId = `ttclid_burst_${Date.now().toString(36)}`;

    try {
      const promises = Array.from({ length: 10 }).map((_, i) =>
        fetch('/api/v1/postbacks/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            network,
            orderId: fixedOrderId,
            clickId: fixedClickId,
            amount: 140.0,
            eventType: 'purchase',
            campaign: 'TT-BURST-TEST',
          }),
        }).then(r => r.json())
      );

      const results = await Promise.all(promises);
      setBurstStatus('Executed 10 postbacks: 1 created canonical conversion, 9 suppressed as duplicate without duplicate TikTok dispatch.');
      setResult({ burstResults: results });
    } catch (err: any) {
      setBurstStatus(`Burst failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">End-to-End Simulation & Verification Lab</h1>
            <span className="badge badge-success text-[10px]">LIVE PRODUCTION RADAR</span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Test inbound S2S postbacks from any network, verify ttclid extraction, and inspect live TikTok Events API delivery
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/conversions"
            className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20"
          >
            Conversions Debugger &rarr;
          </Link>
        </div>
      </div>

      {/* Production Live Postback URL Generator Bar */}
      <div className="bg-[#111827] border border-blue-500/30 rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-white">
            <span className="text-blue-400">🔗</span>
            <span>Live Production Postback Test URL for {network.toUpperCase()}:</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => copyToClipboard(getTestUrl(), 'url')}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all flex items-center gap-1.5"
            >
              <span>📋</span> {copiedUrl ? 'Copied URL!' : 'Copy Test URL'}
            </button>
            <button
              onClick={() => copyToClipboard(`curl -i "${getTestUrl()}"`, 'curl')}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all flex items-center gap-1.5"
            >
              <span>💻</span> {copiedCurl ? 'Copied cURL!' : 'Copy cURL Command'}
            </button>
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-[#0a0f1d] border border-slate-800 text-[11px] font-mono text-emerald-400 break-all select-all">
          {getTestUrl()}
        </div>
        <p className="text-[11px] text-slate-400">
          💡 You can paste this URL directly into your browser, run it via terminal / Postman, or paste it in your affiliate network postback tester.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Simulator Controls */}
        <div className="lg:col-span-6 bg-[#111827] border border-slate-800/80 rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-white border-b border-slate-800/80 pb-3 flex items-center justify-between">
            <span>Simulate Conversion Ingestion</span>
            <span className="text-xs text-blue-400 font-mono">1-Click Dispatch</span>
          </h2>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Affiliate Network
              </label>
              <select
                value={network}
                onChange={e => setNetwork(e.target.value)}
                className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value="maxweb">MaxWeb (subid, subid5, order_id, amount)</option>
                <option value="buygoods">BuyGoods (subid, order_id, amount)</option>
                <option value="digistore24">Digistore24 (cid, order_id, amount_affiliate)</option>
                <option value="clickbank">ClickBank (extclid, receipt, amount)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Order / Transaction ID
                </label>
                <input
                  type="text"
                  value={orderId}
                  onChange={e => setOrderId(e.target.value)}
                  className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Commission Payout ($)
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                TikTok Click ID (ttclid)
              </label>
              <input
                type="text"
                value={clickId}
                onChange={e => setClickId(e.target.value)}
                className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Event Type
                </label>
                <select
                  value={eventType}
                  onChange={e => setEventType(e.target.value)}
                  className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3 py-2 text-white"
                >
                  <option value="purchase">Purchase (Initial Sale)</option>
                  <option value="upsell">Upsell (Subsequent Basket Item)</option>
                  <option value="rebill">Rebill (Recurring Subscription)</option>
                  <option value="refund">Refund (Deduct Commission)</option>
                  <option value="chargeback">Chargeback</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Campaign Label
                </label>
                <input
                  type="text"
                  value={campaign}
                  onChange={e => setCampaign(e.target.value)}
                  className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="pt-2 grid grid-cols-2 gap-3">
              <button
                onClick={() => handleSimulate()}
                disabled={loading}
                className="py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow-lg shadow-blue-600/20 transition-all text-center"
              >
                {loading ? 'Ingesting...' : '▶ Ingest Test Conversion'}
              </button>

              <button
                onClick={handleDuplicateBurst}
                disabled={loading}
                className="py-2.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 font-semibold rounded-lg transition-all text-center"
              >
                ⚡ 10x Duplicate Burst Test
              </button>
            </div>

            {/* Edge Case Scenarios */}
            <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-2">
              <button
                onClick={() => handleSimulate({ clickId: '__CLICKID__' })}
                className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
              >
                Test Missing Click ID
              </button>
              <button
                onClick={() => handleSimulate({ eventType: 'upsell', amount: 59.0 })}
                className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
              >
                Test +$59 Upsell
              </button>
              <button
                onClick={() => handleSimulate({ eventType: 'refund' })}
                className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-rose-300 text-[11px]"
              >
                Test Refund Event
              </button>
            </div>
          </div>
        </div>

        {/* Live Simulation Response Inspector */}
        <div className="lg:col-span-6 bg-[#111827] border border-slate-800/80 rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-white border-b border-slate-800/80 pb-3 flex items-center justify-between">
            <span>Real-time Ingestion Result</span>
            {result?.success && <span className="badge badge-success text-[10px]">TikTok Dispatched</span>}
          </h2>

          {burstStatus && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300">
              {burstStatus}
            </div>
          )}

          {result ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">HTTP Response:</span>
                <span className={`badge ${result.success ? 'badge-success' : 'badge-danger'}`}>
                  {result.httpStatus} {result.success ? 'OK (Ingested & Processed)' : 'ERROR'}
                </span>
              </div>

              <div className="bg-[#0d1322] p-3 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto">
                <pre>{JSON.stringify(result, null, 2)}</pre>
              </div>

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300 flex items-center justify-between">
                <span>View full step-by-step audit in Debugger:</span>
                <Link href="/conversions" className="font-bold underline">
                  Open Conversions &rarr;
                </Link>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 text-xs border border-dashed border-slate-800 rounded-lg">
              Click &quot;Ingest Test Conversion&quot; or copy the Live Test URL above to inspect the live HTTP postback response, idempotency check, and TikTok Events API dispatch.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
