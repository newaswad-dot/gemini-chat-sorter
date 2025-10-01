import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { MessageCircle, Settings, Sparkles, Copy, Download, Wifi, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ProcessingOptions {
  sortBy: 'agency' | 'location' | 'amount' | 'original';
  mergeDuplicates: boolean;
  showOnlyIds: boolean;
}

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
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown');
  const [apiKey] = useState<string>(() => getInitialStoredValue(STORAGE_KEYS.apiKey, DEFAULT_API_KEY));
  const [apiEndpoint] = useState<string>(() =>
    getInitialStoredValue(STORAGE_KEYS.apiEndpoint, DEFAULT_API_ENDPOINT)
  );
  const [options, setOptions] = useState<ProcessingOptions>({
    sortBy: 'original',
    mergeDuplicates: false,
    showOnlyIds: false,
  });
  const [hasProcessed, setHasProcessed] = useState(false);
  const [messageCountSummary, setMessageCountSummary] = useState('');
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
        options,
        apiKey,
        apiEndpoint,
      }),
    [apiEndpoint, apiKey, inputText, options]
  );
  const lastProcessedSignature = useRef<string>('');
  const pendingAutoSignature = useRef<string | null>(null);

  const checkConnection = async () => {
    if (!apiKey.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال مفتاح API الخاص بـ Gemini",
        variant: "destructive",
      });
      return;
    }

    if (!apiEndpoint.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال رابط واجهة Gemini API",
        variant: "destructive",
      });
      return;
    }

    setIsCheckingConnection(true);

    try {
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
              text: 'مرحبا'
            }]
          }],
          generationConfig: {
            temperature: 0.1,
            topK: 1,
            topP: 1,
            maxOutputTokens: 10,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.candidates && data.candidates[0]) {
        setConnectionStatus('connected');
        toast({
          title: "متصل",
          description: "الاتصال مع Gemini API يعمل بشكل صحيح",
          variant: "default",
        });
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      setConnectionStatus('disconnected');
      toast({
        title: "خطأ في الاتصال",
        description: "فشل الاتصال مع Gemini API. تحقق من المفتاح.",
        variant: "destructive",
      });
    } finally {
      setIsCheckingConnection(false);
    }
  };

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
        const sortInstruction = {
          original: 'حافظ على نفس ترتيب الرسائل الأصلي دون أي تغيير.',
          agency: 'رتب البطاقات تصاعدياً حسب اسم الوكالة.',
          location: 'رتب البطاقات تصاعدياً حسب العنوان.',
          amount: 'رتب البطاقات حسب قيمة المبالغ من الأصغر إلى الأكبر إن وُجدت، وإن لم تتوفر مبالغ فحافظ على الترتيب الأصلي.',
        }[options.sortBy];

        const mergeInstruction = options.mergeDuplicates
          ? 'ادمج الرسائل التي تمتلك نفس الاسم تماماً مع تجميع ايديهاتها في بطاقة واحدة مع ذكر كل ايدي في سطر مستقل.'
          : 'لا تدمج أي رسائل حتى لو تكرر الاسم.';

        const showOnlyIdsInstruction = options.showOnlyIds
          ? 'فعّل وضع عرض الايديهات فقط: اعرض كل وكالة بالشكل "وكالة <اسم الوكالة>" يتبعها الايديهات المرتبطة بها فقط. الايديهات التي لا تعرف وكالتها تُجمع تحت "وكالة غير معروفة".'
          : 'اعرض جميع الحقول لكل رسالة كما هو موضح في القواعد، ولا تستخدم وضع عرض الايديهات فقط.';

        const optionsGuidance = `
تعليمات إضافية بناءً على خيارات المستخدم:
- ${sortInstruction}
- ${mergeInstruction}
- ${showOnlyIdsInstruction}
`;

        const systemPrompt = `${DEFAULT_SYSTEM_PROMPT.trim()}\n\n${optionsGuidance}`;

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
            const summaryMatch = result.match(/عدد الرسائل المحللة\s*:\s*\d+/);
            let summaryLine = '';
            let cleanedResult = result;

            if (summaryMatch) {
              summaryLine = summaryMatch[0].trim();
              cleanedResult = result.replace(summaryMatch[0], '').trimEnd();
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
        toast({
          title: "خطأ في المعالجة",
          description: trigger === 'manual' ? "حدث خطأ أثناء معالجة الرسائل. يرجى المحاولة مرة أخرى." : "فشل تحديث الخيارات تلقائياً. حاول المعالجة يدوياً.",
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [apiEndpoint, apiKey, autoSignature, inputText, options, toast]
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
  }, [apiEndpoint, apiKey, autoSignature, hasProcessed, inputText, isProcessing, options, processMessages]);

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
    setConnectionStatus('unknown');
    setIsProcessing(false);
    setIsCheckingConnection(false);
    setMessageCountSummary('');
    pendingAutoSignature.current = null;
    lastProcessedSignature.current = '';
  };

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8 font-arabic">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-4 animate-fade-in">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 rounded-full bg-gradient-primary shadow-medium">
              <MessageCircle className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              منظم رسائل واتساب
            </h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            استخدم الذكاء الاصطناعي Gemini 2.5 لترتيب وتنظيم رسائل واتساب الخاصة بوكالات العملة المشفرة
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Input Section */}
          <Card className="animate-slide-up shadow-medium bg-gradient-card border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                إعدادات المعالجة
              </CardTitle>
              <CardDescription>
                أدخل رسائل واتساب واختر خيارات المعالجة
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
                  تم تثبيت إعدادات Gemini الافتراضية بما في ذلك مفتاح API، رابط الواجهة، منطق المعالجة، وترتيب النتائج.
                </div>
                <p className="text-xs text-muted-foreground">
                  سيتم استخدام هذه الإعدادات تلقائياً ولا حاجة لإدخالها يدوياً.
                </p>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id="mergeDuplicates"
                    checked={options.mergeDuplicates}
                    onCheckedChange={(checked) => setOptions({ ...options, mergeDuplicates: !!checked })}
                  />
                  <Label htmlFor="mergeDuplicates" className="text-sm">
                    دمج المكرر (نفس الاسم، ايديهات مختلفة)
                  </Label>
                </div>

                <div className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id="showOnlyIds"
                    checked={options.showOnlyIds}
                    onCheckedChange={(checked) => setOptions({ ...options, showOnlyIds: !!checked })}
                  />
                  <Label htmlFor="showOnlyIds" className="text-sm">
                    إظهار الايديهات فقط
                  </Label>
                </div>

                <p className="text-xs text-muted-foreground">
                  ترتيب النتائج مثبت على الترتيب الأصلي لضمان الالتزام بالتعليمات المعتمدة.
                </p>
              </div>

              <Separator />

              {/* Input Text Area */}
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

              {/* Process Button */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={checkConnection}
                  disabled={isCheckingConnection || !apiKey.trim() || !apiEndpoint.trim()}
                  variant="outline"
                  size="lg"
                >
                  {isCheckingConnection ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                      جاري التحقق...
                    </>
                  ) : (
                    <>
                      <Wifi className={`h-5 w-5 ${
                        connectionStatus === 'connected' ? 'text-success' : 
                        connectionStatus === 'disconnected' ? 'text-destructive' : 
                        'text-muted-foreground'
                      }`} />
                      اتصال
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => processMessages()}
                  disabled={isProcessing || !inputText.trim() || !apiKey.trim() || !apiEndpoint.trim()}
                  variant="whatsapp"
                  size="lg"
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
              </div>
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
                      يظهر عدد الرسائل المحللة خارج الصندوق أعلى هذا السطر.
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