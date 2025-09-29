import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { MessageCircle, Settings, Sparkles, Copy, Download, Wifi, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';

interface ProcessingOptions {
  sortBy: 'agency' | 'location' | 'amount' | 'original';
  mergeDuplicates: boolean;
  showOnlyIds: boolean;
}

const MessageOrganizer = () => {
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown');
  const [apiKey, setApiKey] = useState('');
  const [options, setOptions] = useState<ProcessingOptions>({
    sortBy: 'original',
    mergeDuplicates: false,
    showOnlyIds: false,
  });
  const [hasProcessed, setHasProcessed] = useState(false);
  const { toast } = useToast();
  const autoSignature = useMemo(
    () =>
      JSON.stringify({
        input: inputText,
        options,
        apiKey,
      }),
    [apiKey, inputText, options]
  );
  const lastProcessedSignature = useRef<string>('');
  const pendingAutoSignature = useRef<string | null>(null);

  // Function to count WhatsApp messages
  const countWhatsAppMessages = (text: string) => {
    if (!text.trim()) return 0;

    const normalized = text.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');

    const separatorPattern = /^(?:\*{3,}|[-=]{5,}|_{5,}|المجموع\s*:?.*)$/;
    const looksLikeNewMessage = (value: string) => {
      const trimmed = value.trim();

      if (!trimmed) {
        return false;
      }

      if (/^\[?\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4},?\s*\d{1,2}:\d{2}(?::\d{2})?/.test(trimmed)) {
        return true;
      }

      if (/^(?:\+?\d[\d\s-]{7,}|ID\s*:|ايدي\s*:)/i.test(trimmed)) {
        return true;
      }

      if (/^[@#]/.test(trimmed)) {
        return true;
      }

      if (/^[A-Za-z\u0600-\u06FF]+\s*[:|-]/.test(trimmed)) {
        return true;
      }

      return false;
    };

    const groups: string[][] = [];
    let currentGroup: string[] = [];

    const commitGroup = () => {
      if (currentGroup.some(line => line.trim().length > 0)) {
        groups.push(currentGroup);
      }
      currentGroup = [];
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      if (!trimmed) {
        commitGroup();
        return;
      }

      if (separatorPattern.test(trimmed)) {
        commitGroup();
        return;
      }

      if (currentGroup.length > 0 && looksLikeNewMessage(trimmed)) {
        const previous = currentGroup[currentGroup.length - 1].trim();
        if (!separatorPattern.test(previous)) {
          commitGroup();
        }
      }

      currentGroup.push(line);

      if (index === lines.length - 1) {
        commitGroup();
      }
    });

    const blocks = groups
      .map(group => group.join('\n').trim())
      .filter(block => block.length > 0);

    const filteredBlocks = blocks.filter(block => !block.startsWith('عدد الرسائل'));

    return filteredBlocks.length;
  };

  const checkConnection = async () => {
    if (!apiKey.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال مفتاح API الخاص بـ Gemini",
        variant: "destructive",
      });
      return;
    }

    setIsCheckingConnection(true);

    try {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=' + apiKey, {
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

      setIsProcessing(true);

      try {
        const systemPrompt = `
أنت مساعد ذكي متخصص في ترتيب رسائل واتساب الخاصة بوكالات العملة المشفرة.

مهمتك: استخراج وترتيب المعلومات التالية من كل رسالة:
- الاسم
- العنوان
- الايدي
- رقم الهاتف
- اسم الوكالة

قواعد التنسيق:

1) إذا كانت الرسالة تحتوي على ايدي واحد:
الاسم
العنوان
الايدي
رقم الهاتف
اسم الوكالة

2) إذا كانت تحتوي على أكثر من ايدي:
الاسم
العنوان
رقم الهاتف
اسم الوكالة

الايدي ...
الايدي ...
-------------------------
المجموع :

3) إذا كانت تحتوي على طريقة تحويل (الهرم، الفؤاد، شام كاش، شحن براتب، خصم من النسبة):
الاسم
العنوان
رقم الهاتف
ملاحظة : (اكتب نوع التحويل كما ورد)
اسم الوكالة

الايدي ...
الايدي ...
-------------------------
المجموع :

4) إذا كانت تحتوي على عنوان محفظة (hex مثل 12776fae8670d360a11c2d1c5202103c):
الاسم
العنوان
رقم الهاتف
ملاحظة : شام كاش
<عنوان المحفظة>
اسم الوكالة

الايدي ...
الايدي ...
-------------------------
المجموع :

5) إذا كانت الرسالة فقط على الشكل أو حتى بشكل مختلف:
الايدي
اسم الوكالة
→ تُترك كما هي وبنفس ترتيبها الأصلي.

6) كل رسالة تتحول إلى بطاقة مستقلة، وبين كل بطاقة وبطاقة سطر فراغ واحد ليسهل القراءة.

7) لا تُكتب المبالغ أبداً.

8) خيارات الترتيب:
- حسب الوكالة
- حسب العنوان
- حسب المبلغ
- أو إبقاء الترتيب الأصلي

9) خيار دمج المكرر:
- يتم الدمج فقط إذا كان الاسم نفسه تماماً لكن الايديهات مختلفة.
- غير ذلك لا دمج.

10) خيار إظهار الايديهات فقط:
- يتم تجميع الايديهات تحت اسم الوكالة بالشكل:
وكالة <اسم الوكالة>
<ID1>
<ID2>
<ID3>

- إذا لم يكن للـID وكالة معروفة يوضع تحت "وكالة غير معروفة".

تعليمات إضافية:
- لا تستخدم أي ايموجي في المخرجات إطلاقاً.
- افصل بين كل بطاقة رسالة بسطر فارغ واحد فقط بدون استخدام رموز مثل *** أو =====.
- اترك سطر "المجموع :" دون أي أرقام أو كلمات إضافية بعده.
- لا تهمل أي رسالة حتى وإن بدت مكررة أو غير مكتملة.
- عامِل أرقام الهواتف اللبنانية (مثل +961، أو أرقام تبدأ بـ03، 70، 71، 76، 78، 79) كأرقام هواتف وليست ايديهات.
- إذا لم يتوفر رقم الهاتف فاذكر "رقم الهاتف : غير متوفر".
- حافظ على ترتيب الحقول كما هو موضح أعلاه.
`;

        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=' + apiKey, {
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
            setOutputText(result);
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
            throw new Error('Empty response text');
          }
        } else {
          throw new Error('Invalid response format');
        }
      } catch (error) {
        console.error('Error processing messages:', error);
        toast({
          title: "خطأ في المعالجة",
          description: trigger === 'manual' ? "حدث خطأ أثناء معالجة الرسائل. يرجى المحاولة مرة أخرى." : "فشل تحديث الخيارات تلقائياً. حاول المعالجة يدوياً.",
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [apiKey, autoSignature, inputText, options, toast]
  );

  useEffect(() => {
    if (!hasProcessed) {
      return;
    }

    if (!inputText.trim() || !apiKey.trim()) {
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
  }, [apiKey, autoSignature, hasProcessed, inputText, isProcessing, options, processMessages]);

  useEffect(() => {
    if (!pendingAutoSignature.current) {
      return;
    }

    if (!hasProcessed) {
      pendingAutoSignature.current = null;
      return;
    }

    if (!inputText.trim() || !apiKey.trim()) {
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
  }, [apiKey, autoSignature, hasProcessed, inputText, isProcessing, processMessages]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(outputText);
    toast({
      title: "تم النسخ",
      description: "تم نسخ النتيجة إلى الحافظة",
    });
  };

  const downloadResult = () => {
    const blob = new Blob([outputText], { type: 'text/plain;charset=utf-8' });
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
              {/* API Key Input */}
              <div className="space-y-2">
                <Label htmlFor="apiKey">مفتاح Gemini API</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="أدخل مفتاح API الخاص بك"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  احصل على مفتاحك من{' '}
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Google AI Studio
                  </a>
                </p>
              </div>

              <Separator />

              {/* Processing Options */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>ترتيب النتائج</Label>
                  <Select value={options.sortBy} onValueChange={(value: any) => setOptions({ ...options, sortBy: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="original">الترتيب الأصلي</SelectItem>
                      <SelectItem value="agency">حسب الوكالة</SelectItem>
                      <SelectItem value="location">حسب العنوان</SelectItem>
                      <SelectItem value="amount">حسب المبلغ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

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
                    <Badge variant="secondary">
                      📥 {countWhatsAppMessages(inputText)} رسالة مدخلة
                    </Badge>
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
                  disabled={isCheckingConnection || !apiKey.trim()}
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
                  disabled={isProcessing || !inputText.trim() || !apiKey.trim()}
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
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                    <span>عدد الأحرف: {outputText.length.toLocaleString('ar-EG')}</span>
                    <Badge variant="secondary">
                      📊 {countWhatsAppMessages(outputText)} رسالة في النتيجة
                    </Badge>
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