import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchAyah, RECITER_IDS } from "@/lib/quran";
import { expectedRules, FAMILY_LABEL } from "@/lib/tajweed";
import { AUDIO_FORMATS, type AnalysisResult, type TajweedAnalysis } from "@/lib/analysis-types";

const MODEL = "google/gemini-3.8-flash";
const MAX_AUDIO_BASE64 = 12_000_000; // ~9 MB recording

const InputSchema = z.object({
  surah: z.number().int().min(1).max(114),
  ayah: z.number().int().min(1).max(286),
  reciter: z.string().refine((r) => RECITER_IDS.includes(r)),
  audioBase64: z.string().min(100).max(MAX_AUDIO_BASE64),
  format: z.enum(AUDIO_FORMATS),
});

const confidence = { type: "string", enum: ["high", "medium", "low"] };
const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "recording_quality",
    "recited_matches_ayah",
    "heard_text",
    "overall_confidence",
    "summary",
    "rules",
    "word_issues",
    "advice",
  ],
  properties: {
    recording_quality: { type: "string", enum: ["good", "noisy", "too_quiet", "too_short", "unclear"] },
    recited_matches_ayah: { type: "string", enum: ["yes", "partially", "no", "unclear"] },
    heard_text: { type: "string" },
    overall_confidence: confidence,
    summary: { type: "string" },
    rules: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["rule", "status", "confidence", "observation", "how_to_fix"],
        properties: {
          rule: {
            type: "string",
            enum: ["madd", "ghunnah", "izhar", "idgham", "ikhfa", "iqlab", "qalqalah", "makharij"],
          },
          status: { type: "string", enum: ["correct", "needs_attention", "uncertain", "not_present"] },
          confidence,
          observation: { type: "string" },
          how_to_fix: { type: "string" },
        },
      },
    },
    word_issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["word", "issue", "how_to_fix", "confidence"],
        properties: {
          word: { type: "string" },
          issue: { type: "string" },
          how_to_fix: { type: "string" },
          confidence,
        },
      },
    },
    advice: { type: "string" },
  },
} as const;

async function toBase64(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function buildPrompt(uthmani: string, markup: string): string {
  const rules = expectedRules(markup);
  const ruleLines = rules.length
    ? rules.map((r) => `- ${FAMILY_LABEL[r.family]} — ${r.name} — في: «${r.context}»`).join("\n")
    : "- لا توجد أحكام نون/ميم/مد/قلقلة معلَّمة في هذه الآية";
  return `أنت معلّم تجويد متقن بروايـة حفص عن عاصم، تستمع لتسجيلين صوتيين:
- التسجيل الأول: تلاوة مرجعية لقارئ متقن (الشيخ).
- التسجيل الثاني: تلاوة الطالب لنفس الآية، مسجّلة بميكروفون هاتف.

نص الآية بالرسم العثماني:
«${uthmani}»

الأحكام المتوقعة في هذه الآية (مستخرجة من المصحف المجوّد):
${ruleLines}

المطلوب: قارن تلاوة الطالب بتلاوة الشيخ وبالأحكام المتوقعة، ثم أعد JSON مطابقاً للمخطط.

قواعد صارمة للأمانة العلمية:
1. لا تخترع أخطاء. إن لم تسمع الموضع بوضوح فاجعل الحالة "uncertain" والثقة "low".
2. تحليل الصوت من تسجيل هاتف تقريبي؛ لا تُصدر حكماً قطعياً إلا إذا كان الخطأ واضحاً جداً (مثل حذف كلمة أو إبدال حرف بيّن).
3. للمدود: قارن طول المد عند الطالب بطوله عند الشيخ نسبياً، ولا تدّعِ عدّ الحركات بدقة.
4. إن كان التسجيل صامتاً أو قصيراً أو مشوشاً أو ليس هذه الآية، فاذكر ذلك في recording_quality و recited_matches_ayah، واجعل جميع الأحكام "uncertain"، ولا تقدّم ملاحظات تجويد.
5. أدرج في rules عنصراً واحداً لكل من: madd, ghunnah, izhar, idgham, ikhfa, iqlab, qalqalah, makharij. استخدم "not_present" للحكم غير الموجود في الآية حسب القائمة أعلاه (المخارج والغنة في النون والميم المشددتين قد توجد دائماً).
6. heard_text: ما سمعته من الطالب فعلاً بالعربية مع التشكيل قدر الإمكان، لا نص الآية الأصلي.
7. word_issues: فقط للكلمات التي سمعت فيها مشكلة محددة، مع شرح عملي لطريقة التصحيح (موضع اللسان أو الشفتين، طول الصوت، إلخ).
8. اكتب كل النصوص بالعربية الفصحى المبسطة، بلطف وتشجيع، وباختصار.`;
}

export const analyzeRecitation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<AnalysisResult> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { ok: false, error: "خدمة التحليل غير مهيأة على الخادم." };

    // Server loads the authoritative ayah text and reference audio itself.
    let ayah;
    try {
      ayah = await fetchAyah(data.surah, data.ayah, data.reciter);
    } catch {
      return { ok: false, error: "تعذّر تحميل الآية أو تلاوة الشيخ من المصدر." };
    }
    const refUrl = ayah.audioFallback ?? ayah.audio;
    const refRes = await fetch(refUrl);
    if (!refRes.ok) return { ok: false, error: "تعذّر تحميل تلاوة الشيخ للمقارنة." };
    const refB64 = await toBase64(await refRes.arrayBuffer());

    const body = {
      model: MODEL,
      stream: true,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildPrompt(ayah.uthmani, ayah.tajweedMarkup) },
            { type: "text", text: "التسجيل الأول (الشيخ):" },
            { type: "input_audio", input_audio: { data: refB64, format: "mp3" } },
            { type: "text", text: "التسجيل الثاني (الطالب):" },
            { type: "input_audio", input_audio: { data: data.audioBase64, format: data.format } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "tajweed_analysis", strict: true, schema: RESPONSE_SCHEMA },
      },
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      let msg = "";
      try {
        const j = (await res.json()) as { error?: { message?: string }; message?: string };
        msg = j.error?.message ?? j.message ?? "";
      } catch {
        /* ignore */
      }
      console.error("AI gateway error", res.status, msg);
      if (res.status === 429) return { ok: false, error: "ضغط كبير على خدمة التحليل، حاول بعد دقيقة." };
      if (res.status === 402)
        return { ok: false, error: msg || "نفد رصيد خدمة التحليل بالذكاء الاصطناعي." };
      if (res.status === 400)
        return { ok: false, error: "تعذّر قراءة التسجيل. سجّل مرة أخرى بصوت واضح." };
      return { ok: false, error: msg || "تعذّر تحليل التلاوة حالياً." };
    }

    // Consume the SSE stream and accumulate the JSON text.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let refused = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload) as {
            choices?: { delta?: { content?: string | null; refusal?: string | null } }[];
          };
          for (const c of j.choices ?? []) {
            if (c.delta?.content) text += c.delta.content;
            if (c.delta?.refusal) refused = true;
          }
        } catch {
          /* partial frame — ignore */
        }
      }
    }

    if (refused || !text.trim()) return { ok: false, error: "لم يُرجِع المحلل نتيجة. حاول مرة أخرى." };
    try {
      const cleaned = text.trim().replace(/^```(?:json)?/, "").replace(/```$/, "");
      const analysis = JSON.parse(cleaned) as TajweedAnalysis;
      return { ok: true, analysis, model: MODEL };
    } catch {
      console.error("Unparseable analysis", text.slice(0, 500));
      return { ok: false, error: "تعذّر قراءة نتيجة التحليل. حاول مرة أخرى." };
    }
  });
