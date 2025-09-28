import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { MessageCircle, Settings, Sparkles, Copy, Download } from 'lucide-react';
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
  const [apiKey, setApiKey] = useState('');
  const [options, setOptions] = useState<ProcessingOptions>({
    sortBy: 'original',
    mergeDuplicates: false,
    showOnlyIds: false,
  });
  const { toast } = useToast();

  const processMessages = async () => {
    if (!inputText.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال النص المراد معالجته",
        variant: "destructive",
      });
      return;
    }

    if (!apiKey.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال مفتاح API الخاص بـ Gemini",
        variant: "destructive",
      });
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
👤 الاسم
📍 العنوان
🔑 الايدي
📞 رقم الهاتف
🏢 اسم الوكالة

2) إذا كانت تحتوي على أكثر من ايدي:
👤 الاسم
📍 العنوان
📞 رقم الهاتف
🏢 اسم الوكالة

🔑 الايدي
🔑 الايدي
════════════════
المجموع : <عدد الايديهات>

3) إذا كانت تحتوي على طريقة تحويل (الهرم، الفؤاد، شام كاش، شحن براتب، خصم من النسبة):
👤 الاسم
📍 العنوان
📞 رقم الهاتف
💳 ملاحظة : (نوع التحويل)
🏢 اسم الوكالة

🔑 الايدي
🔑 الايدي
════════════════
المجموع : <عدد الايديهات>

4) إذا كانت تحتوي على عنوان محفظة (hex):
👤 الاسم
📍 العنوان
📞 رقم الهاتف
💳 ملاحظة : شام كاش
👜 <عنوان المحفظة>
🏢 اسم الوكالة

🔑 الايدي
🔑 الايدي
════════════════
المجموع : <عدد الايديهات>

5) إذا كانت الرسالة فقط:
🔑 الايدي
🏢 اسم الوكالة
→ تُترك كما هي

خيارات المعالجة:
- ترتيب: ${options.sortBy === 'agency' ? 'حسب الوكالة' : options.sortBy === 'location' ? 'حسب العنوان' : options.sortBy === 'amount' ? 'حسب المبلغ' : 'الترتيب الأصلي'}
- دمج المكرر: ${options.mergeDuplicates ? 'نعم' : 'لا'}
- إظهار الايديهات فقط: ${options.showOnlyIds ? 'نعم' : 'لا'}

أضف في النهاية:
📊 عدد الرسائل : <العدد>

لا تكتب المبالغ أبداً، واستبعدها من النتيجة.
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
        const result = data.candidates[0].content.parts[0].text;
        setOutputText(result);
        toast({
          title: "تم بنجاح",
          description: "تم معالجة الرسائل وترتيبها",
          variant: "default",
        });
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Error processing messages:', error);
      toast({
        title: "خطأ في المعالجة",
        description: "حدث خطأ أثناء معالجة الرسائل. يرجى المحاولة مرة أخرى.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

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
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>عدد الأحرف: {inputText.length.toLocaleString('ar-EG')}</span>
                  <Badge variant="secondary">
                    {inputText.split('\n').filter(line => line.trim()).length} سطر
                  </Badge>
                </div>
              </div>

              {/* Process Button */}
              <Button
                onClick={processMessages}
                disabled={isProcessing || !inputText.trim() || !apiKey.trim()}
                className="w-full"
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
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>عدد الأحرف: {outputText.length.toLocaleString('ar-EG')}</span>
                    <Badge variant="secondary">
                      {outputText.split('\n').filter(line => line.trim()).length} سطر
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