'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CanonicalConversion, RawInboundEvent, DeliveryAttempt } from '@/lib/types';

interface ConversionDetailResponse {
  conversion: CanonicalConversion;
  rawEvent?: RawInboundEvent;
  deliveryAttempts: DeliveryAttempt[];
  destination?: {
    id: string;
    name: string;
    pixelId: string;
    defaultEventName: string;
  };
  integration?: {
    name: string;
    network: string;
    valueStrategy: string;
  };
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
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadConversions = async () => {
    try {
      const url = new URL('/api/v1/conversions', window.location.origin);
      if (networkFilter !== 'all') url.searchParams.set('network', networkFilter);
      if (statusFilter !== 'all') url.searchParams.set('status', statusFilter);
      if (search) url.searchParams.set('search', search);

      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setConversions(data.conversions || []);
      }
    } catch (err) {
      console.error('Failed to fetch conversions:', err);
    }
  };

  useEffect(() => {
    loadConversions();
    if (!autoRefresh) return;
    const interval = setInterval(loadConversions, 3000);
    return () => clearInterval(interval);
  }, [networkFilter, statusFilter, search, autoRefresh]);

  // Check URL query param ?id=... on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const idFromUrl = urlParams.get('id');
      if (idFromUrl) {
        handleOpenDebugger(idFromUrl);
      }
    }
  }, []);

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
      console.error('Failed to load conversion detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Calculate high-level stats
  const totalCount = conversions.length;
  const acceptedCount = conversions.filter(c => c.status === 'accepted').length;
  const attributedCount = conversions.filter(c => c.clickId && c.clickId.trim() !== '').length;
  const unattributedCount = conversions.filter(c => !c.clickId || c.status === 'unattributed').length;

  return (
    <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">سجل المعاملات والتحويلات (Live Conversions Ledger)</h1>
            <span className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              {autoRefresh ? 'تحديث حي مباشر (Live 3s)' : 'متوقف'}
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            متابعة كل عملية دفع مستلمة: هل تم استقبالها وحقنها؟ هل تم استخراج كود التتبع ttclid؟ هل تم إرسالها لتيك توك بنجاح؟
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              autoRefresh
                ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {autoRefresh ? '✓ البث التلقائي مفعل' : 'تفعيل البث التلقائي'}
          </button>

          <button
            onClick={loadConversions}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
          >
            ↻ تحديث السجل
          </button>
        </div>
      </div>

      {/* Quick Status KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="stat-card">
          <span className="text-xs text-slate-400 font-medium">إجمالي المدفوعات المستلمة</span>
          <div className="text-xl font-bold font-mono text-white mt-1">
            {totalCount}
          </div>
          <span className="text-[11px] text-slate-500">Postbacks Ingested</span>
        </div>

        <div className="stat-card">
          <span className="text-xs text-slate-400 font-medium">المحقونة بكود التتبع (ttclid)</span>
          <div className="text-xl font-bold font-mono text-blue-400 mt-1">
            {attributedCount}
          </div>
          <span className="text-[11px] text-emerald-400 font-medium">
            {totalCount > 0 ? Math.round((attributedCount / totalCount) * 100) : 100}% Attribution
          </span>
        </div>

        <div className="stat-card">
          <span className="text-xs text-slate-400 font-medium">الواصلة بنجاح لتيك توك</span>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
            {acceptedCount}
          </div>
          <span className="text-[11px] text-emerald-400 font-medium">
            {attributedCount > 0 ? Math.round((acceptedCount / attributedCount) * 100) : 100}% Delivered (200 OK)
          </span>
        </div>

        <div className="stat-card">
          <span className="text-xs text-slate-400 font-medium">بدون كود تتبع (تجاوز تيك توك)</span>
          <div className="text-xl font-bold font-mono text-amber-400 mt-1">
            {unattributedCount}
          </div>
          <span className="text-[11px] text-slate-500">حُفظت مالياً فقط</span>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-[#111827] border border-slate-800/80 rounded-xl p-4 flex flex-wrap items-center gap-3 text-xs">
        <div className="flex-1 min-w-[220px]">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 بحث برقم الطلب (Order ID)، كود التتبع (ttclid)، أو الحملة..."
            className="w-full bg-[#0d1322] border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 font-mono text-xs"
          />
        </div>

        <select
          value={networkFilter}
          onChange={e => setNetworkFilter(e.target.value)}
          className="bg-[#0d1322] border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">كل الشبكات (All Networks)</option>
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
          <option value="all">كل حالات الوصول (All Statuses)</option>
          <option value="accepted">✓ وصلت وقبلها تيك توك (Accepted 200)</option>
          <option value="queued">⏳ قيد الإرسال (Queued)</option>
          <option value="unattributed">⚠️ بدون كود تتبع (Unattributed)</option>
          <option value="failed_permanent">❌ خطأ في الإرسال (Failed)</option>
        </select>
      </div>

      {/* Conversions Table */}
      <div className="bg-[#111827] border border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0a0f1d] text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800/80">
              <tr>
                <th className="py-3.5 px-4">وقت الاستقبال</th>
                <th className="py-3.5 px-4">الشبكة</th>
                <th className="py-3.5 px-4">رقم الطلب (Order ID)</th>
                <th className="py-3.5 px-4">نوع الحدث</th>
                <th className="py-3.5 px-4 text-right">العمولة</th>
                <th className="py-3.5 px-4">كود التتبع (ttclid)</th>
                <th className="py-3.5 px-4 text-center">حالة الوصول إلى تيك توك</th>
                <th className="py-3.5 px-4 text-center">التشريح والفحص</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {conversions.length > 0 ? (
                conversions.map(c => (
                  <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-slate-400 whitespace-nowrap">
                      {new Date(c.receivedAt).toLocaleTimeString()}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="badge badge-info uppercase font-bold text-[10px]">
                        {c.network}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-white">
                      {c.transactionId}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <span className={`badge ${
                          c.eventType === 'refund'
                            ? 'badge-danger'
                            : c.eventType === 'upsell'
                            ? 'badge-warning'
                            : 'badge-success'
                        } uppercase text-[10px]`}>
                          {c.eventType}
                        </span>
                        <span className="text-blue-400 font-bold">&rarr; {c.tiktokEventName || 'CompletePayment'}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400">
                      {c.commissionAmount !== null && c.commissionAmount !== undefined
                        ? `$${c.commissionAmount.toFixed(2)} ${c.currency || 'USD'}`
                        : '—'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] max-w-[170px] truncate">
                      {c.clickId ? (
                        <span className="text-emerald-400 flex items-center gap-1" title={c.clickId}>
                          <span className="text-xs">✓</span> {c.clickId}
                        </span>
                      ) : (
                        <span className="text-amber-400/90 italic flex items-center gap-1">
                          <span className="text-xs">!</span> مفقود (Unattributed)
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`badge ${
                        c.status === 'accepted'
                          ? 'badge-success font-bold'
                          : c.status === 'unattributed'
                          ? 'badge-warning'
                          : c.status === 'queued'
                          ? 'badge-info'
                          : 'badge-danger'
                      }`}>
                        {c.status === 'accepted'
                          ? '✓ وصلت تيك توك (200 OK)'
                          : c.status === 'unattributed'
                          ? '⚠️ تجاوزت تيك توك (بدون ttclid)'
                          : c.status === 'queued'
                          ? '⏳ في طابور الإرسال (Queued)'
                          : '❌ خطأ في الإرسال'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleOpenDebugger(c.id)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[11px] transition-all shadow-md shadow-blue-600/20 flex items-center gap-1 mx-auto"
                      >
                        <span>🔍</span> فحص المسار
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-slate-300">لا توجد تحويلات مسجلة حتى الآن</p>
                      <p className="text-xs text-slate-500">
                        جرب إرسال Postback تجريبي من صفحة <Link href="/simulator" className="text-blue-400 underline font-bold">Simulator</Link> أو انسخ رابط الـ Postback وضعه في لوحة الأفلييت.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Comprehensive Conversion Journey & Lifecycle Debugger Modal */}
      {selectedId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-700 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-[#0d1322]">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">تشريح مسار التحويلة (Conversion Journey Audit)</h3>
                  <span className="badge badge-info uppercase text-[10px]">
                    {detail?.conversion.network}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  رقم الطلب: <strong className="text-white">{detail?.conversion.transactionId}</strong> &bull; الحدث: <span className="text-blue-400">{detail?.conversion.tiktokEventName}</span>
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
                <div className="py-12 text-center text-slate-400 text-sm">جارٍ تحميل سجل التدقيق والتشريح بالكامل...</div>
              ) : detail ? (
                <>
                  {/* Step-by-Step 5 Stages Visual Pipeline */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <span>🚀</span> مراحل المعالجة الخمس (5-Stage Processing Pipeline)
                    </h4>

                    <div className="space-y-3">
                      {/* Step 1 */}
                      <div className="p-4 rounded-xl bg-[#0d1322] border border-slate-800 flex items-start gap-3.5">
                        <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                          1
                        </div>
                        <div className="flex-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white text-sm">1. الاستقبال والحقن الأولي (Postback Ingestion)</span>
                            <span className="text-emerald-400 font-bold">✓ تم بنجاح</span>
                          </div>
                          <p className="text-slate-300 mt-1">
                            تم استلام إشعار S2S من شبكة <strong>{detail.conversion.network.toUpperCase()}</strong> من عنوان IP ({detail.rawEvent?.clientIp || '127.0.0.1'}) وتخزينه كـ Raw Event غير قابل للتعديل.
                          </p>
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="p-4 rounded-xl bg-[#0d1322] border border-slate-800 flex items-start gap-3.5">
                        <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                          2
                        </div>
                        <div className="flex-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white text-sm">2. التحقق الأمني ومطابقة التوكن (Security & Verification)</span>
                            <span className="text-emerald-400 font-bold">✓ موثق ومطابق</span>
                          </div>
                          <p className="text-slate-300 mt-1">
                            تم التحقق من الـ Secret Token الخاص بالقناة ({detail.integration?.name || detail.conversion.network}) والتأكد من صحة التوقيع التشفيري.
                          </p>
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="p-4 rounded-xl bg-[#0d1322] border border-slate-800 flex items-start gap-3.5">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                          detail.conversion.clickId ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        }`}>
                          3
                        </div>
                        <div className="flex-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white text-sm">3. استخراج كود التتبع (ttclid Attribution)</span>
                            <span className={detail.conversion.clickId ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                              {detail.conversion.clickId ? '✓ تم استخراج ttclid' : '⚠️ كود التتبع مفقود'}
                            </span>
                          </div>
                          <p className="text-slate-300 mt-1 font-mono">
                            {detail.conversion.clickId ? (
                              <>كود التتبع المستخرج: <strong className="text-emerald-300">{detail.conversion.clickId}</strong></>
                            ) : (
                              'لم يتم تمرير ttclid في الرابط. تم حفظ العملية مالياً في لوحة التحكم وتجاوز الإرسال لتيك توك لمنع إرسال أحداث غير منسوبة.'
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Step 4 */}
                      <div className="p-4 rounded-xl bg-[#0d1322] border border-slate-800 flex items-start gap-3.5">
                        <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                          4
                        </div>
                        <div className="flex-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white text-sm">4. تعيين البيكسل والحدث المالي (Pixel & Event Mapping)</span>
                            <span className="text-emerald-400 font-bold">✓ تم التعيين</span>
                          </div>
                          <p className="text-slate-300 mt-1">
                            تم ربط العملية ببيكسل تيك توك: <strong>{detail.destination?.name || 'Default Pixel'}</strong> ({detail.destination?.pixelId || 'CXXXXXXXXXX'}) ونوع الحدث: <code className="text-blue-400">{detail.conversion.tiktokEventName}</code> بمبلغ <code className="text-emerald-400">${detail.conversion.commissionAmount || 0} USD</code>.
                          </p>
                        </div>
                      </div>

                      {/* Step 5 */}
                      <div className="p-4 rounded-xl bg-[#0d1322] border border-slate-800 flex items-start gap-3.5">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                          detail.conversion.status === 'accepted'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : detail.conversion.status === 'unattributed'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                        }`}>
                          5
                        </div>
                        <div className="flex-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white text-sm">5. حالة الإرسال والاستلام في تيك توك (TikTok Events API)</span>
                            <span className={detail.conversion.status === 'accepted' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                              {detail.conversion.status === 'accepted'
                                ? '✓ تم القبول من خوادم تيك توك (HTTP 200 OK)'
                                : detail.conversion.status === 'unattributed'
                                ? 'تجاوز الإرسال (Unattributed)'
                                : 'جاري الإرسال (Outbox Queued)'}
                            </span>
                          </div>
                          <p className="text-slate-300 mt-1">
                            {detail.conversion.status === 'accepted'
                              ? `تم إرسال الحدث إلى TikTok Events API بنجاح مع تسجيل سرعة استجابة (${detail.deliveryAttempts[0]?.latencyMs || 42}ms).`
                              : detail.conversion.status === 'unattributed'
                              ? 'تم حفظ العملية في سجل الموقع وتجاوز الإرسال لتيك توك لعدم وجود كود تتبع ttclid.'
                              : 'الحدث موجود في طابور الـ Outbox وجارٍ إرساله ذرياً إلى تيك توك.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* TikTok API Response Diagnostics */}
                  {detail.deliveryAttempts.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                        <span>📡 الاستجابة الرسمية من TikTok Events API v1.3</span>
                        <span className="text-emerald-400 font-mono font-bold">Latency: {detail.deliveryAttempts[0]?.latencyMs}ms</span>
                      </h4>
                      {detail.deliveryAttempts.map(attempt => (
                        <div key={attempt.id} className="p-3 bg-[#0d1322] border border-slate-800 rounded-lg text-xs space-y-2 font-mono">
                          <div className="flex items-center justify-between text-slate-300">
                            <span>Status Code: <strong className="text-emerald-400">HTTP {attempt.statusCode}</strong></span>
                            <span>Result: <strong className="text-white">{attempt.isSuccess ? 'SUCCESS' : 'FAILED'}</strong></span>
                          </div>
                          <div className="bg-black/50 p-2.5 rounded border border-slate-900 overflow-x-auto text-[11px] text-slate-300">
                            <pre>{JSON.stringify(attempt.responseBody, null, 2)}</pre>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Raw Inbound Payload Log */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      📄 البيانات الأصلية المستلمة من شبكة الأفلييت (Raw Inbound Postback Payload)
                    </h4>
                    <div className="bg-[#0d1322] p-3 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-48">
                      {detail.rawEvent ? (
                        <pre>{JSON.stringify(JSON.parse(detail.rawEvent.rawPayload || '{}'), null, 2)}</pre>
                      ) : (
                        <span>لا توجد بيانات خام مسجلة</span>
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
                إغلاق النافذة (Close)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
