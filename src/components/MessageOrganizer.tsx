import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { MessageCircle, Sparkles, Copy, Download, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const STORAGE_KEYS = {
  apiKey: 'gemini_api_key',
  apiEndpoint: 'gemini_api_endpoint',
} as const;

const DEFAULT_API_KEY = 'AIzaSyCynyALJ4poVtL2Pm68ZBxkAft_-X7i-yc';
const DEFAULT_API_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

const DEFAULT_SYSTEM_PROMPT = `
أنت مساعد ذكي متخصص في ترتيب رسائل واتساب الخاصة بوكالات العملة المشفرة.

مهمتك:

استخراج وترتيب المعلومات التالية من كل رسالة:

الاسم

العنوان

الايدي

رقم الهاتف

اسم الوكالة


قواعد التنسيق العامة:

ضع كل حقل في سطر مستقل.
لا تترك أسطر فارغة بين الحقول.
افصل بين البطاقات بسطر فارغ واحد فقط.
لا تستخدم رموز مثل *** أو =====.
اكتب الايدي مباشرة كرقم دون كلمة "الايدي".
لا تكتب المبالغ أبداً.
الاسم يكتب كما ورد حرفياً.
فرّق بين الهاتف والايدي:

الأرقام اللبنانية (+961، 03، 70، 71، 76، 78، 79) = هواتف.
الأرقام التي تبدأ بـ+ أو 00 مع شرطة أو فراغ = هواتف.
الأرقام بجانب كلمة "وكالة" = ايديهات إلا إذا كانت أرقام هواتف لبنانية.


حلّل الرسائل واحدة تلو الأخرى بالترتيب.


الحالات:

1) رسالة تحتوي على ايدي واحد:

الاسم
العنوان
123456789
رقم الهاتف
اسم الوكالة

2) رسالة تحتوي على أكثر من ايدي:

الاسم
العنوان
رقم الهاتف
اسم الوكالة
123456789 ...
987654321 ...
-------------------------
المجموع :

مثال:

مروان يوسف يوسفجه
سوريا ادلب/ مشمشان
+0031669582
وكالة موج لبحر
48207546 ...
48259631 ...
-------------------------
المجموع :

3) إذا احتوت على طريقة تحويل (الهرم، الفؤاد، شا كاش، شحن براتب، خصم من النسبة):

الاسم
العنوان
رقم الهاتف
ملاحظة : <نوع التحويل>
اسم الوكالة
<ID1 ...>
<ID2 ...>
-------------------------
المجموع :

4) إذا احتوت على عنوان محفظة (hex):

الاسم
العنوان
رقم الهاتف
ملاحظة : شام كاش
<عنوان المحفظة>
اسم الوكالة
<ID1 ...>
<ID2 ...>
-------------------------
المجموع :

5) إذا كانت الرسالة على الشكل (الايدي + الوكالة فقط):

<ID>
<اسم الوكالة>

→ تكتب كما هي.

ضوابط إضافية:

"المجموع :" يكتب فقط عند وجود أكثر من ايدي.
خط الفاصل "-------------------------" يستخدم فقط عند وجود أكثر من ايدي.
خيار الدمج: يدمج فقط إذا الاسم نفسه بالضبط لكن ايديهات مختلفة.
خيار إظهار الايديهات فقط:


وكالة <اسم الوكالة>
<ID1>
<ID2>
<ID3>

إذا لم يعرف الوكالة:


وكالة غير معروفة
<ID>

لا تستخدم ايموجي.
لا تهمل أي رسالة حتى لو بدت ناقصة أو مكررة.
اكتب عدد الرسائل في الاسفل

يتم كتابة عدد الرسائل بنائن على الرسائل وليس الايديهات
`;

const DEFAULT_OPTIONS_GUIDANCE = `
تعليمات إضافية بناءً على خيارات المستخدم:
- حافظ على نفس ترتيب الرسائل الأصلي دون أي تغيير.
- لا تدمج أي رسائل حتى لو تكرر الاسم.
- اعرض جميع الحقول لكل رسالة كما هو موضح في القواعد، ولا تستخدم وضع عرض الايديهات فقط.
`;

const normalizeDigitString = (value: string) => {
  const arabicIndicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'] as const;
  return value.replace(/[٠-٩]/g, (digit) => {
    const index = arabicIndicDigits.indexOf(digit as (typeof arabicIndicDigits)[number]);
    return index >= 0 ? String(index) : digit;
  });
};

const extractMessageCountValue = (summaryLine: string) => {
  const countMatch = summaryLine.match(/[0-9٠-٩]+/);
  if (!countMatch) {
    return '';
  }

  const normalized = normalizeDigitString(countMatch[0]);
  const numericValue = Number(normalized);

  if (Number.isNaN(numericValue)) {
    return countMatch[0];
  }

  return numericValue.toLocaleString('ar-EG');
};

const getInitialStoredValue = (storageKey: string, fallback: string) => {
  if (typeof window !== 'undefined') {
    const storedValue = window.localStorage.getItem(storageKey);
    if (storedValue !== null) {
      return storedValue;
    }
  }
  return fallback;
};

const MessageOrganizer = () => {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiKey] = useState<string>(() => getInitialStoredValue(STORAGE_KEYS.apiKey, DEFAULT_API_KEY));
  const [apiEndpoint] = useState<string>(() =>
    getInitialStoredValue(STORAGE_KEYS.apiEndpoint, DEFAULT_API_ENDPOINT)
  );
  const [hasProcessed, setHasProcessed] = useState(false);
  const [messageCountSummary, setMessageCountSummary] = useState('');
  const [messageCountValue, setMessageCountValue] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(STORAGE_KEYS.apiKey, apiKey);
  }, [apiKey]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(STORAGE_KEYS.apiEndpoint, apiEndpoint);
  }, [apiEndpoint]);

  const autoSignature = useMemo(
    () =>
      JSON.stringify({
        input: inputText,
        apiKey,
        apiEndpoint,
      }),
    [apiEndpoint, apiKey, inputText]
  );
  const lastProcessedSignature = useRef<string>('');
  const pendingAutoSignature = useRef<string | null>(null);

  const processMessages = useCallback(
    async (trigger: 'manual' | 'auto' = 'manual') => {
      if (!inputText.trim()) {
        if (trigger === 'manual') {
          toast({
            title: "خطأ",
            description: "يرجى إدخال النص المراد معالجته",
            variant: "destructive",
          });
        }
        return;
      }

      if (!apiKey.trim()) {
        if (trigger === 'manual') {
          toast({
            title: "خطأ",
            description: "يرجى إدخال مفتاح API الخاص بـ Gemini",
            variant: "destructive",
          });
        }
        return;
      }

      if (!apiEndpoint.trim()) {
        if (trigger === 'manual') {
          toast({
            title: "خطأ",
            description: "يرجى إدخال رابط واجهة Gemini API",
            variant: "destructive",
          });
        }
        return;
      }

      setIsProcessing(true);

      try {
        const systemPrompt = `${DEFAULT_SYSTEM_PROMPT.trim()}\n\n${DEFAULT_OPTIONS_GUIDANCE.trim()}`;

        const trimmedEndpoint = apiEndpoint.trim();
        const key = encodeURIComponent(apiKey.trim());
        const requestUrl = `${trimmedEndpoint}${trimmedEndpoint.includes('?') ? '&' : '?'}key=${key}`;

        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: systemPrompt + '\n\nالنص المراد معالجته:\n' + inputText
              }]
            }],
            generationConfig: {
              temperature: 0.1,
              topK: 1,
              topP: 1,
              maxOutputTokens: 8192,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
          const result = data.candidates[0].content.parts[0].text?.trim();
          if (result) {
            const summaryMatch = result.match(/عدد الرسائل المحللة\s*:\s*[0-9٠-٩]+/);
            let summaryLine = '';
            let cleanedResult = result;

            if (summaryMatch) {
              summaryLine = summaryMatch[0].trim();
              setMessageCountValue(extractMessageCountValue(summaryLine));
              cleanedResult = result.replace(summaryMatch[0], '').trimEnd();
            } else {
              setMessageCountValue('');
            }

            setOutputText(cleanedResult.trimEnd());
            setMessageCountSummary(summaryLine);
            setHasProcessed(true);
            lastProcessedSignature.current = autoSignature;
            pendingAutoSignature.current = null;
            if (trigger === 'manual') {
              toast({
                title: "تم بنجاح",
                description: "تم معالجة الرسائل وترتيبها",
                variant: "default",
              });
            }
          } else {
            setMessageCountSummary('');
            throw new Error('Empty response text');
          }
        } else {
          throw new Error('Invalid response format');
        }
      } catch (error) {
        console.error('Error processing messages:', error);
        setMessageCountSummary('');
        setMessageCountValue('');
        toast({
          title: "خطأ في المعالجة",
          description: trigger === 'manual' ? "حدث خطأ أثناء معالجة الرسائل. يرجى المحاولة مرة أخرى." : "فشل تحديث الخيارات تلقائياً. حاول المعالجة يدوياً.",
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [apiEndpoint, apiKey, autoSignature, inputText, toast]
  );

  useEffect(() => {
    if (!hasProcessed) {
      return;
    }

    if (!inputText.trim() || !apiKey.trim() || !apiEndpoint.trim()) {
      return;
    }

    if (autoSignature === lastProcessedSignature.current) {
      return;
    }

    if (isProcessing) {
      pendingAutoSignature.current = autoSignature;
      return;
    }

    pendingAutoSignature.current = null;
    processMessages('auto');
  }, [apiEndpoint, apiKey, autoSignature, hasProcessed, inputText, isProcessing, processMessages]);

  useEffect(() => {
    if (!pendingAutoSignature.current) {
      return;
    }

    if (!hasProcessed) {
      pendingAutoSignature.current = null;
      return;
    }

    if (!inputText.trim() || !apiKey.trim() || !apiEndpoint.trim()) {
      pendingAutoSignature.current = null;
      return;
    }

    if (isProcessing) {
      return;
    }

    if (autoSignature === lastProcessedSignature.current) {
      pendingAutoSignature.current = null;
      return;
    }

    const signatureToRun = pendingAutoSignature.current;
    pendingAutoSignature.current = null;

    if (signatureToRun) {
      processMessages('auto');
    }
  }, [apiEndpoint, apiKey, autoSignature, hasProcessed, inputText, isProcessing, processMessages]);

  const copyToClipboard = () => {
    const fullText = messageCountSummary ? `${outputText}\n\n${messageCountSummary}`.trim() : outputText;
    navigator.clipboard.writeText(fullText);
    toast({
      title: "تم النسخ",
      description: "تم نسخ النتيجة إلى الحافظة",
    });
  };

  const downloadResult = () => {
    const fullText = messageCountSummary ? `${outputText}\n\n${messageCountSummary}`.trim() : outputText;
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whatsapp-organized-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "تم التحميل",
      description: "تم تحميل النتيجة كملف نصي",
    });
  };

  const clearAll = () => {
    setInputText('');
    setOutputText('');
    setHasProcessed(false);
    setIsProcessing(false);
    setMessageCountSummary('');
    setMessageCountValue('');
    pendingAutoSignature.current = null;
    lastProcessedSignature.current = '';
  };

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8 font-arabic">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Input Section */}
          <Card className="animate-slide-up shadow-medium bg-gradient-card border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                الصق رسائل واتساب
              </CardTitle>
              <CardDescription>أدخل رسائل واتساب المراد تحليلها وترتيبها</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="inputText">نص رسائل واتساب</Label>
                <Textarea
                  id="inputText"
                  placeholder="الصق هنا رسائل واتساب المراد ترتيبها..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="min-h-[300px] resize-none"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>عدد الأحرف: {inputText.length.toLocaleString('ar-EG')}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs md:text-sm text-muted-foreground">
                      سيتم تحديد عدد الرسائل بواسطة الذكاء الاصطناعي بعد المعالجة.
                    </span>
                    <Button onClick={clearAll} variant="ghost" size="sm" disabled={!inputText && !outputText}>
                      <Trash2 className="h-4 w-4" />
                      مسح الكل
                    </Button>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => processMessages()}
                disabled={isProcessing || !inputText.trim() || !apiKey.trim() || !apiEndpoint.trim()}
                variant="whatsapp"
                size="lg"
                className="w-full"
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
                    جاري المعالجة...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    معالجة الرسائل
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Output Section */}
          <Card className="animate-slide-up shadow-medium bg-gradient-card border-border/50" style={{ animationDelay: '0.1s' }}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-success" />
                  النتيجة المنسقة
                </CardTitle>
                {outputText && (
                  <div className="flex gap-2">
                    <Button onClick={copyToClipboard} variant="outline" size="sm">
                      <Copy className="h-4 w-4" />
                      نسخ
                    </Button>
                    <Button onClick={downloadResult} variant="outline" size="sm">
                      <Download className="h-4 w-4" />
                      تحميل
                    </Button>
                  </div>
                )}
              </div>
              <CardDescription>
                {outputText ? 'تم تنسيق الرسائل بنجاح' : 'ستظهر النتيجة هنا بعد المعالجة'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {outputText ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="messageCount" className="text-sm font-medium">
                      عدد الرسائل بعد التحليل
                    </Label>
                    <Input
                      id="messageCount"
                      value={messageCountValue}
                      readOnly
                      placeholder="لم يتم تحديد عدد الرسائل بعد"
                      className="bg-muted/30"
                    />
                    <p className="text-xs text-muted-foreground">
                      يتم تعبئة هذا الحقل تلقائياً عند اكتمال التحليل والترتيب.
                    </p>
                  </div>
                  <Textarea
                    value={outputText}
                    readOnly
                    className="min-h-[400px] resize-none font-mono text-sm bg-muted/30"
                  />
                  {messageCountSummary && (
                    <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-primary">
                      {messageCountSummary}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                    <span>عدد الأحرف: {outputText.length.toLocaleString('ar-EG')}</span>
                    <span className="text-xs md:text-sm text-muted-foreground">
                      يظهر عدد الرسائل المحللة في الحقل أعلاه.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="min-h-[400px] flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <div className="p-4 rounded-full bg-muted/30 w-fit mx-auto">
                      <MessageCircle className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground">
                      أدخل النص واضغط على "معالجة الرسائل" لرؤية النتيجة
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default MessageOrganizer;