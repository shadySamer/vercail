'use client';

import { useState, useEffect, useRef } from 'react';

interface ConversionEvent {
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

interface ConversionDetail {
  conversion: ConversionEvent & {
    idempotencyKey: string;
    errorMessage?: string;
    processedAt?: string;
  };
  rawEvent?: {
    clientIp: string;
    rawPayload: string;
    verificationStatus: string;
  };
  destination?: {
    name: string;
    pixelId: string;
    defaultEventName: string;
  };
  deliveryAttempts: Array<{
    id: string;
    statusCode: number;
    latencyMs: number;
    isSuccess: boolean;
    responseBody: any;
    errorMessage?: string;
  }>;
  journey: Array<{
    step: number;
    title: string;
    status: string;
    timestamp: string;
    details: string;
    isSuccess: boolean;
  }>;
}

export default function LivePostbackNotifier() {
  const [latestNotification, setLatestNotification] = useState<ConversionEvent | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(true);

  const seenIdsRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);

  useEffect(() => {
    if (!isLiveActive) return;

    const pollConversions = async () => {
      try {
        const res = await fetch('/api/v1/conversions?limit=15');
        if (!res.ok) return;
        const data = await res.json();
        const conversions: ConversionEvent[] = data.conversions || [];

        if (initialLoadRef.current) {
          // On first load, populate seen IDs without triggering notifications
          conversions.forEach(c => seenIdsRef.current.add(c.id));
          initialLoadRef.current = false;
          return;
        }

        // Detect newly arrived conversions
        for (const c of conversions) {
          if (!seenIdsRef.current.has(c.id)) {
            seenIdsRef.current.add(c.id);
            setLatestNotification(c);
            setShowToast(true);
            break; // Show one at a time
          }
        }
      } catch (err) {
        // ignore polling errors
      }
    };

    pollConversions();
    const interval = setInterval(pollConversions, 2500);
    return () => clearInterval(interval);
  }, [isLiveActive]);

  const handleOpenDebugger = async (id: string) => {
    setSelectedId(id);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/v1/conversions/${id}`);
      if (res.ok) {
        const data = await res.json();
        setDetail(data);
      }
    } catch (err) {
      console.error('Failed to load conversion audit trail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <>
      {/* Floating Live Radar Status Bar (Top Right) */}
      <div className="fixed top-4 right-4 z-40 flex items-center gap-2 bg-[#111827]/90 backdrop-blur-md border border-slate-700/60 px-3 py-1.5 rounded-full shadow-lg text-xs font-mono">
        <span className="relative flex h-2.5 w-2.5">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isLiveActive ? 'bg-emerald-400' : 'bg-slate-400'} opacity-75`}></span>
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isLiveActive ? 'bg-emerald-500' : 'bg-slate-500'}`}></span>
        </span>
        <span className="text-slate-300 font-semibold tracking-wider text-[11px]">
          {isLiveActive ? 'LIVE S2S RADAR' : 'RADAR PAUSED'}
        </span>
        <button
          onClick={() => setIsLiveActive(!isLiveActive)}
          className="text-[10px] text-slate-400 hover:text-white bg-slate-800 px-2 py-0.5 rounded transition-colors ml-1"
          title="Toggle live postback polling"
        >
          {isLiveActive ? 'Pause' : 'Resume'}
        </button>
      </div>

      {/* Instant Inbound Postback Notification Toast */}
      {showToast && latestNotification && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md w-full bg-[#111827] border-2 border-emerald-500/50 rounded-2xl shadow-2xl p-4 animate-in slide-in-from-bottom-5 duration-300 text-slate-100 flex flex-col gap-3 backdrop-blur-xl">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-bold text-xs uppercase tracking-wider text-emerald-400">
                🔔 New Inbound Postback Received!
              </span>
            </div>
            <button
              onClick={() => setShowToast(false)}
              className="text-slate-400 hover:text-slate-200 text-sm font-bold px-1.5 py-0.5 rounded bg-slate-800"
            >
              ✕
            </button>
          </div>

          {/* Details Card */}
          <div className="bg-[#0d1322] p-3 rounded-xl border border-slate-800 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="badge badge-info uppercase font-bold text-[10px]">
                {latestNotification.network}
              </span>
              <span className="font-mono text-emerald-400 font-bold text-sm">
                {latestNotification.commissionAmount !== null
                  ? `$${latestNotification.commissionAmount.toFixed(2)} ${latestNotification.currency || 'USD'}`
                  : 'Commission: N/A'}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-300 font-mono text-[11px]">
              <span>Order: <strong className="text-white">{latestNotification.transactionId}</strong></span>
              <span className="text-blue-400">&rarr; {latestNotification.tiktokEventName}</span>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <span className="text-slate-400">ttclid:</span>
              {latestNotification.clickId ? (
                <span className="text-emerald-300 truncate max-w-[200px]" title={latestNotification.clickId}>
                  {latestNotification.clickId}
                </span>
              ) : (
                <span className="text-amber-400 italic">Missing (unattributed)</span>
              )}
            </div>

            {/* TikTok Delivery Status Bar */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${
                  latestNotification.status === 'accepted'
                    ? 'bg-emerald-400'
                    : latestNotification.status === 'unattributed'
                    ? 'bg-amber-400'
                    : 'bg-blue-400 animate-spin'
                }`}></span>
                <span className="text-[11px] font-bold">
                  {latestNotification.status === 'accepted' ? (
                    <span className="text-emerald-400">Accepted by TikTok Events API (HTTP 200)</span>
                  ) : latestNotification.status === 'unattributed' ? (
                    <span className="text-amber-400">Saved in DB &bull; Skipped TikTok (Missing ttclid)</span>
                  ) : (
                    <span className="text-blue-400">Queued in Outbox...</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              onClick={() => handleOpenDebugger(latestNotification.id)}
              className="flex-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors text-center shadow-lg shadow-blue-600/30"
            >
              🔍 Inspect Flow & TikTok Response
            </button>
            <button
              onClick={() => setShowToast(false)}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Global Conversion Journey Debugger Modal */}
      {selectedId && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-700 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-[#0d1322]">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">Live Conversion Journey Debugger</h3>
                  <span className="badge badge-info uppercase text-[10px]">
                    {detail?.conversion.network}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  Order ID: {detail?.conversion.transactionId} &bull; Target Event: {detail?.conversion.tiktokEventName}
                </p>
              </div>

              <button
                onClick={() => setSelectedId(null)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {loadingDetail ? (
                <div className="py-12 text-center text-slate-400 text-sm">Loading complete audit trail...</div>
              ) : detail ? (
                <>
                  {/* Step-by-Step Visual Journey */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Attribution & Delivery Pipeline
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
                        TikTok Events API Response Evidence
                      </h4>
                      {detail.deliveryAttempts.map(attempt => (
                        <div key={attempt.id} className="p-3 bg-[#0d1322] border border-slate-800 rounded-lg text-xs space-y-2 font-mono">
                          <div className="flex items-center justify-between text-slate-300">
                            <span className="font-bold text-white">Status: HTTP {attempt.statusCode} {attempt.isSuccess ? '(Success)' : '(Failed)'}</span>
                            <span className="text-emerald-400 font-bold">Latency: {attempt.latencyMs}ms</span>
                          </div>
                          <div className="bg-black/40 p-2.5 rounded border border-slate-900 overflow-x-auto text-[11px] text-slate-300">
                            <pre>{JSON.stringify(attempt.responseBody, null, 2)}</pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Raw Inbound Postback Payload */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Raw Inbound Postback Payload (Immutable Evidence)
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

            {/* Footer */}
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
    </>
  );
}
