# دليل النشر والتشغيل على Vercel (Production Deployment Guide)

تم تجهيز المنصة لتكون جاهزة 100% للنشر السريع على **Vercel** كـ Serverless SaaS مع قاعدة بيانات PostgreSQL سحابية.

---

## 1. المتطلبات السريعة قبل النشر (3 دقائق)

1. **حساب على Vercel**: [vercel.com](https://vercel.com)
2. **حساب على GitHub**: لرفع الكود.
3. **قاعدة بيانات PostgreSQL سحابية مجانية**:
   - يمكنك استخدام **Vercel Postgres** (مباشرة بضغطة زر داخل لوحة Vercel).
   - أو **Neon** ([neon.tech](https://neon.tech)) مجاني ويعمل مع Vercel بتوافق تام.
   - أو **Supabase** ([supabase.com](https://supabase.com)).

---

## 2. خطوات النشر على Vercel بالتفصيل

### الخطوة 1: رفع المشروع إلى مستودع GitHub (Git Repository)

افتح موجه الأوامر (Terminal) داخل مجلد المشروع `f:\wecantrack` ونفّذ:

```bash
git init
git add .
git commit -m "Production release: Direct S2S Conversion Hub for TikTok Ads"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

---

### الخطوة 2: استيراد المشروع في Vercel (Import Project)

1. ادخل على لوحة تحكم [Vercel Dashboard](https://vercel.com/dashboard).
2. اضغط على زر **Add New...** ثم اختر **Project**.
3. اختر مستودع الـ GitHub الخاص بك واضغط **Import**.
4. في خانة **Framework Preset**، سيتعرف Vercel تلقائيًا على **Next.js**.

---

### الخطوة 3: إعداد المتغيرات البيئية (Environment Variables)

داخل صفحة إعداد المشروع في Vercel، افتح تبويب **Environment Variables** وأضف المتغيرات التالية:

| اسم المتغير | الوصف | مثال |
| :--- | :--- | :--- |
| `DATABASE_URL` | رابط اتصال قاعدة بيانات PostgreSQL السحابية | `postgresql://user:pass@ep-cool.neon.tech/neondb?sslmode=require` |
| `ENCRYPTION_SECRET` | مفتاح تشفير البيانات الحساسة (32 حرفًا) | `production_super_secret_key_32c` |
| `NEXT_PUBLIC_APP_URL` | الدومين الخاص بمشروعك (أو رابط vercel الافتراضي) | `https://your-project-name.vercel.app` |

> 💡 **ملاحظة:** إذا كنت تستخدم **Vercel Postgres** من قسم **Storage** داخل Vercel، سيقوم Vercel بإضافة `POSTGRES_URL` و `DATABASE_URL` تلقائيًا دون الحاجة لكتابتها يدويًا.

---

### الخطوة 4: النشر (Deploy)

1. اضغط على زر **Deploy**.
2. سيقوم Vercel ببناء المشروع خلال أقل من دقيقة.
3. مبروك! 🎉 ستحصل على رابط الإنتاج المباشر: `https://your-project.vercel.app`.

---

## 3. ربط دومين مخصص (Custom Domain) - اختياري وموصى به

لجعل روابط الـ Postback احترافية (مثل `https://track.yourdomain.com`):

1. في لوحة Vercel، ادخل على **Settings > Domains**.
2. اكتب الدومين أو الـ Subdomain الخاص بك (مثال: `track.mybrand.com`).
3. اضف سجلات الـ **CNAME** أو **A Record** في مزود الدومين الخاص بك (مثل Cloudflare أو Namecheap) كما يطلب منك Vercel.
4. سيتم تفعيل شهادة SSL المجانية تلقائيًا في ثوانٍ.

---

## 4. بعد النشر: كيف تبدأ العمل في دقيقة واحدة؟

1. افتح رابط موقعك على Vercel: `https://your-app.vercel.app`.
2. ادخل على **TikTok Destinations**:
   - أضف **Pixel ID** والـ **Events API Access Token** الطويل من TikTok Ads Manager.
3. ادخل على **Affiliate Integrations**:
   - اربط الشبكة (MaxWeb أو Digistore24 أو BuyGoods أو ClickBank) بوجهة الـ TikTok Destination التي أنشأتها.
   - انسخ الـ **Parameter** وأضفه إلى رابطك داخل TikTok Ads (مثل `&subid5=ttclid(__CLICKID__)`).
   - انسخ الـ **Postback URL** وضعه في لوحة تحكم شبكة الأفلييت.
4. **تهانينا!** بمجرد حدوث أي عملية شراء، ستصل التحويلة إلى منصتك وتُرسل فوريًا وبدقة إلى TikTok Events API.
