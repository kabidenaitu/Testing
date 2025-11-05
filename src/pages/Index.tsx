import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Layout/Header';
import { Footer } from '@/components/Layout/Footer';
import { Stepper } from '@/components/Wizard/Stepper';
import { FileUpload } from '@/components/Wizard/FileUpload';
import { ComplaintCard } from '@/components/Wizard/ComplaintCard';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/contexts/LanguageContext';
import { Complaint, MediaFile } from '@/types/complaint';
import { analyzeComplaint, submitComplaint } from '@/services/api';
import { toast } from '@/hooks/use-toast';
import { Loader2, Send } from 'lucide-react';
import heroImage from '@/assets/hero-transit.jpg';
import { ClarificationChat } from '@/components/Wizard/ClarificationChat';

const Index = () => {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1 state
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  // Step 2 state (clarifications)
  const [questions, setQuestions] = useState<any[]>([]);

  // Step 3 state (preview)
  const [complaint, setComplaint] = useState<Complaint | null>(null);

  const steps = [
    t('wizard.step1'),
    t('wizard.step2'),
    t('wizard.step3'),
    t('wizard.step4'),
  ];

  const handleAnalyze = async () => {
    if (!description.trim()) {
      toast({
        title: t('errors.title'),
        description: t('errors.describeSituation'),
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await analyzeComplaint(description, {});
      
      if (response.needsClarification && response.questions.length > 0) {
        setQuestions(response.questions);
        setCurrentStep(2);
      } else {
        // Go directly to preview if no clarifications needed
        const newComplaint: Complaint = {
          description,
          priority: response.priority,
          tuples: response.extractedFields.tuples || [],
          media: files,
          isAnonymous,
          contactName: !isAnonymous ? contactName : undefined,
          contactPhone: !isAnonymous ? contactPhone : undefined,
          contactEmail: !isAnonymous ? contactEmail : undefined,
          recommendation: t('step3.defaultRecommendation'),
          extractedTime: new Date().toLocaleTimeString(language === 'kz' ? 'kk-KZ' : 'ru-RU'),
        };
        setComplaint(newComplaint);
        setCurrentStep(3);
      }
    } catch (error) {
      toast({
        title: t('errors.title'),
        description: t('errors.analyzeFailed'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerQuestion = (questionId: string, answer: string) => {
    setQuestions(prev =>
      prev.map(q =>
        q.id === questionId ? { ...q, answered: true, answer } : q
      )
    );
  };

  const handleClarificationsComplete = () => {
    const answeredQuestions = questions.filter(q => q.answered);
    const extractedData: any = {};
    
    answeredQuestions.forEach(q => {
      if (q.field && q.answer) {
        extractedData[q.field] = q.answer;
      }
    });

    const newComplaint: Complaint = {
      description,
      priority: 'medium',
      tuples: [
        {
          route: extractedData.route,
          time: extractedData.time,
          location: extractedData.location,
          aspect: extractedData.aspect,
        },
      ],
      media: files,
      isAnonymous,
      contactName: !isAnonymous ? contactName : undefined,
      contactPhone: !isAnonymous ? contactPhone : undefined,
      contactEmail: !isAnonymous ? contactEmail : undefined,
      recommendation: t('step3.defaultRecommendation'),
      extractedTime: new Date().toLocaleTimeString(language === 'kz' ? 'kk-KZ' : 'ru-RU'),
    };

    setComplaint(newComplaint);
    setCurrentStep(3);
  };

  const handleSubmit = async () => {
    if (!complaint) return;

    setLoading(true);
    try {
      const response = await submitComplaint(complaint);
      toast({
        title: t('step4.success'),
        description: `${t('step4.referenceNumber')}: ${response.referenceNumber}`,
      });
      navigate('/success', { state: { referenceNumber: response.referenceNumber } });
    } catch (error) {
      toast({
        title: t('errors.title'),
        description: t('errors.submitFailed'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-hero opacity-40" />
          <div className="container relative mx-auto px-4 py-16 md:px-6 md:py-24">
            <div className="grid gap-8 lg:grid-cols-2 lg:gap-12 items-center">
              <div className="animate-fade-in">
                <h1 className="mb-4">{t('hero.title')}</h1>
                <p className="mb-8 text-xl text-muted-foreground">
                  {t('hero.description')}
                </p>
                {currentStep === 1 && (
                  <Button
                    size="lg"
                    className="h-14 px-8 text-lg shadow-medium"
                    onClick={() => document.getElementById('wizard')?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    {t('hero.submitButton')}
                  </Button>
                )}
              </div>
              <div className="animate-slide-up">
                <img
                  src={heroImage}
                  alt="Public Transit"
                  className="rounded-2xl shadow-large"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Wizard Section */}
        <section id="wizard" className="bg-muted/30 py-16">
          <div className="container mx-auto max-w-4xl px-4 md:px-6">
            <Stepper steps={steps} currentStep={currentStep} />

            <div className="mt-8 rounded-2xl border bg-card p-6 shadow-medium md:p-8">
              {/* Step 1: Description */}
              {currentStep === 1 && (
                <div className="space-y-6 animate-fade-in">
                  <div>
                    <Label htmlFor="description" className="text-lg">
                      {t('step1.description')}
                    </Label>
                    <Textarea
                      id="description"
                      placeholder={t('step1.placeholder')}
                      className="mt-2 min-h-[200px] text-lg"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>

                  <FileUpload files={files} onFilesChange={setFiles} />

                  <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="anonymous" className="text-base">
                        {t('step1.anonymous')}
                      </Label>
                      <Switch
                        id="anonymous"
                        checked={isAnonymous}
                        onCheckedChange={setIsAnonymous}
                      />
                    </div>

                    {!isAnonymous && (
                      <div className="grid gap-4 pt-4 md:grid-cols-3 animate-fade-in">
                        <div>
                          <Label htmlFor="name">{t('step1.contactName')}</Label>
                          <Input
                            id="name"
                            value={contactName}
                            onChange={(e) => setContactName(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="phone">{t('step1.contactPhone')}</Label>
                          <Input
                            id="phone"
                            value={contactPhone}
                            onChange={(e) => setContactPhone(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="email">{t('step1.contactEmail')}</Label>
                          <Input
                            id="email"
                            type="email"
                            value={contactEmail}
                            onChange={(e) => setContactEmail(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <Button
                    size="lg"
                    className="w-full gap-2 text-lg"
                    onClick={handleAnalyze}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        {t('step1.analyze')}...
                      </>
                    ) : (
                      <>
                        <Send className="h-5 w-5" />
                        {t('step1.analyze')}
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Step 2: Clarifications */}
              {currentStep === 2 && (
                <ClarificationChat
                  questions={questions}
                  onAnswer={handleAnswerQuestion}
                  onComplete={handleClarificationsComplete}
                />
              )}

              {/* Step 3: Preview */}
              {currentStep === 3 && complaint && (
                <div className="space-y-6">
                  <ComplaintCard complaint={complaint} showEdit={false} />
                  
                  <div className="flex gap-4">
                    <Button
                      variant="outline"
                      size="lg"
                      className="flex-1"
                      onClick={() => setCurrentStep(1)}
                    >
                      {t('step3.back')}
                    </Button>
                    <Button
                      size="lg"
                      className="flex-1 gap-2"
                      onClick={handleSubmit}
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          {t('step3.submit')}...
                        </>
                      ) : (
                        t('step3.submit')
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Index;
