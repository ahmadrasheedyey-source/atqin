# قسم التجويد — لإضافته إلى تطبيقك

هذا المجلد فيه **قسم التجويد فقط**: نص الآية بالرسم العثماني، وصوت الشيخ، وتسجيل صوتك، وإعادة الاستماع، والمقارنة، وتحليل التجويد، والانتقال للآية التالية.

## الملفات

| الملف | وظيفته |
|---|---|
| `src/components/tajweed/TajweedTrainer.tsx` | واجهة القسم كاملة (الشيخ، التسجيل، المقارنة، التحليل، الآية التالية) |
| `src/components/tajweed/AyahDisplay.tsx` | عرض الآية بالرسم العثماني مع ألوان التجويد |
| `src/components/tajweed/AnalysisPanel.tsx` | عرض نتيجة التحليل |
| `src/hooks/use-recorder.ts` | تسجيل صوتك من ميكروفون الهاتف |
| `src/lib/quran.ts` | جلب الآيات وتلاوات المشايخ (alquran.cloud) |
| `src/lib/tajweed.ts` | استخراج أحكام التجويد من نص الآية |
| `src/lib/api/tajweed.functions.ts` | **جزء الخادم**: يرسل صوتك وصوت الشيخ للذكاء الاصطناعي للتحليل |
| `src/routes/tajweed.tsx` | صفحة «التجويد» |
| `src/components/ui/*` | أزرار وقوائم يحتاجها القسم |
| `tajweed-theme.css` | الألوان (أخضر، عاجي، ذهبي) وألوان أحكام التجويد |

## طريقة الإضافة

1. انسخ مجلد `src` إلى مشروعك (إذا عندك ملفات بنفس الاسم في `components/ui` احتفظ بملفاتك).
2. أضف محتوى `tajweed-theme.css` إلى ملف الأنماط الرئيسي (يتطلب Tailwind CSS v4).
3. أضف الخطوط في رأس الصفحة:
   `https://fonts.googleapis.com/css2?family=Amiri+Quran&family=IBM+Plex+Sans+Arabic:wght@400;500;600&family=Reem+Kufi:wght@500;600&display=swap`
4. ثبّت المكتبات:
   `@tanstack/react-query @radix-ui/react-select @radix-ui/react-switch @radix-ui/react-slot class-variance-authority clsx tailwind-merge lucide-react zod`
5. اجعل الصفحة باتجاه اليمين لليسار: `<html lang="ar" dir="rtl">`.

## مهم: جزء التحليل

- الاستماع للشيخ، والتسجيل، وإعادة الاستماع، والمقارنة تعمل كلها داخل المتصفح دون أي إعداد.
- **التحليل** يحتاج خادماً ومفتاح ذكاء اصطناعي. الملف `tajweed.functions.ts` مكتوب لمشاريع TanStack Start على Lovable ويستخدم `LOVABLE_API_KEY`.
- إذا كان تطبيقك مبنياً بطريقة أخرى (Next.js، Expo، Flutter…) فيجب نقل هذا الجزء إلى خادم تطبيقك واستخدام نموذج يقبل الصوت (مثل Gemini). لا تضع المفتاح أبداً داخل كود الهاتف أو المتصفح.

## الأمانة

التحليل تقريبي ويعتمد على الذكاء الاصطناعي، ويُظهر «غير مؤكد» عندما لا يكون واثقاً، ولا يخترع درجات. لا يغني عن معلم متقن.
