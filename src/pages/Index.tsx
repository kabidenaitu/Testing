import { useMemo, useState } from 'react';
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
import {
  AnalyzeResponse,
  ClarificationHistoryItem,
  ComplaintDraft,
  ComplaintPreview,
  MediaFile,
  UploadedMedia
} from '@/types/complaint';
import { analyzeComplaint, submitComplaint, uploadMedia } from '@/services/api';
import { toast } from '@/hooks/use-toast';
import { Loader2, Send } from 'lucide-react';
import heroImage from '@/assets/hero-transit.jpg';
import { ClarificationChat } from '@/components/Wizard/ClarificationChat';

const Index = () => {
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(1);
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  const [submissionTimeIso, setSubmissionTimeIso] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResponse | null>(null);
  const [clarificationHistory, setClarificationHistory] = useState<ClarificationHistoryItem[]>([]);
  const [knownFields, setKnownFields] = useState<Record<string, unknown>>({});
  const [complaintPreview, setComplaintPreview] = useState<ComplaintPreview | null>(null);
  const [complaintDraft, setComplaintDraft] = useState<ComplaintDraft | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const steps = useMemo(
    () => [t('wizard.step1'), t('wizard.step2'), t('wizard.step3'), t('wizard.step4')],
    [t]
  );

  const resetClarificationState = () => {
    setClarificationHistory([]);
    setKnownFields({});
    setAnalysisResult(null);
    setComplaintPreview(null);
    setComplaintDraft(null);
    setSubmissionTimeIso(null);
  };

  const chooseClarifyingQuestion = (analysis: AnalyzeResponse): string => {
    if (language === 'kz') {
      return analysis.clarifyingQuestionKk ?? analysis.clarifyingQuestionRu ?? t('step2.description');
    }

    return analysis.clarifyingQuestionRu ?? analysis.clarifyingQuestionKk ?? t('step2.description');
  };

  const ensureMediaUploaded = async (): Promise<UploadedMedia[]> => {
    const updated: MediaFile[] = [];
    const uploadedList: UploadedMedia[] = [];

    for (const file of files) {
      if (file.uploaded) {
        uploadedList.push(file.uploaded);
        updated.push(file);
        continue;
      }

      try {
        const uploaded = await uploadMedia(file.file, file.type);
        updated.push({ ...file, uploaded });
        uploadedList.push(uploaded);
      } catch (error) {
        console.error('Media upload failed', error);
        toast({
          title: t('errors.title'),
          description: t('errors.submitFailed'),
          variant: 'destructive'
        });
        throw error;
      }
    }

    setFiles(updated);
    return uploadedList;
  };

  const buildPreviewState = async (analysis: AnalyzeResponse): Promise<void> => {
    const media = await ensureMediaUploaded();
    const submissionTime = submissionTimeIso ?? new Date().toISOString();

    const contact =
      !isAnonymous && (contactName.trim() || contactPhone.trim() || contactEmail.trim())
        ? {
            name: contactName.trim() || undefined,
            phone: contactPhone.trim() || undefined,
            email: contactEmail.trim() || undefined
          }
        : undefined;

    const draft: ComplaintDraft = {
      description,
      priority: analysis.priority,
      tuples: analysis.tuples,
      analysis,
      media,
      isAnonymous,
      contact,
      source: 'web',
      submissionTime
    };

    setComplaintDraft(draft);

    const preview: ComplaintPreview = {
      description,
      priority: analysis.priority,
      tuples: analysis.tuples,
      mediaFiles: files,
      isAnonymous,
      contact,
      recommendation: analysis.recommendationKk,
      submissionTime
    };

    setComplaintPreview(preview);
    setCurrentStep(3);
  };

  const processAnalysis = async (
    analysis: AnalyzeResponse,
    updatedKnownFields: Record<string, unknown>,
    currentSubmissionTime: string
  ) => {
    setAnalysisResult(analysis);
    setKnownFields(updatedKnownFields);

    if (analysis.needClarification && analysis.missingSlots.length > 0) {
      const slot = analysis.missingSlots[0];
      const question = chooseClarifyingQuestion(analysis);

      setClarificationHistory((prev) => {
        const existingIndex = prev.findIndex((item) => item.slot === slot);
        if (existingIndex >= 0) {
          const copy = [...prev];
          copy[existingIndex] = {
            slot,
            question,
            answer: copy[existingIndex].answer
          };
          return copy;
        }

        return [...prev, { slot, question }];
      });

      setSubmissionTimeIso(currentSubmissionTime);
      setCurrentStep(2);
      return;
    }

    await buildPreviewState(analysis);
    setSubmissionTimeIso(currentSubmissionTime);
  };

  const runAnalysis = async (updatedKnownFields: Record<string, unknown>) => {
    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      toast({
        title: t('errors.title'),
        description: t('errors.describeSituation'),
        variant: 'destructive'
      });
      return;
    }

    setAnalyzing(true);
    try {
      const submissionTime = submissionTimeIso ?? new Date().toISOString();
      const result = await analyzeComplaint({
        description: trimmedDescription,
        knownFields: updatedKnownFields,
        submissionTimeIso: submissionTime
      });
      await processAnalysis(result, updatedKnownFields, submissionTime);
    } catch (error) {
      console.error('Analyze failed', error);
      toast({
        title: t('errors.title'),
        description: t('errors.analyzeFailed'),
        variant: 'destructive'
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyze = async () => {
    resetClarificationState();
    setCurrentStep(1);
    await runAnalysis({});
  };

  const handleClarificationAnswer = async (slot: string, answer: string) => {
    const updatedHistory = clarificationHistory.map((item) =>
      item.slot === slot ? { ...item, answer } : item
    );
    setClarificationHistory(updatedHistory);

    const updatedFields = { ...knownFields, [slot]: answer };
    await runAnalysis(updatedFields);
  };

  const handleSubmit = async () => {
    if (!complaintDraft) {
      return;
    }

    setSubmitting(true);
    try {
      const media = await ensureMediaUploaded();
      const payload: ComplaintDraft = { ...complaintDraft, media };
      const response = await submitComplaint(payload);
      toast({
        title: t('step4.success'),
        description: `${t('step4.referenceNumber')}: ${response.referenceNumber}`
      });
      navigate('/success', { state: { referenceNumber: response.referenceNumber } });
    } catch (error) {
      console.error('Submit failed', error);
      toast({
        title: t('errors.title'),
        description: t('errors.submitFailed'),
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const currentQuestion = clarificationHistory.find((item) => !item.answer);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-hero opacity-40" />
          <div className="container relative mx-auto px-4 py-16 md:px-6 md:py-24">
            <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
              <div className="animate-fade-in">
                <h1 className="mb-4">{t('hero.title')}</h1>
                <p className="mb-8 text-xl text-muted-foreground">{t('hero.description')}</p>
                {currentStep === 1 && (
                  <Button
                    size="lg"
                    className="h-14 px-8 text-lg shadow-medium"
                    onClick={() =>
                      document.getElementById('wizard')?.scrollIntoView({ behavior: 'smooth' })
                    }
                  >
                    {t('hero.submitButton')}
                  </Button>
                )}
              </div>
              <div className="animate-slide-up">
                <img src={heroImage} alt="Public Transit" className="rounded-2xl shadow-large" />
              </div>
            </div>
          </div>
        </section>

        <section id="wizard" className="bg-muted/30 py-16">
          <div className="container mx-auto max-w-4xl px-4 md:px-6">
            <Stepper steps={steps} currentStep={currentStep} />

            <div className="mt-8 rounded-2xl border bg-card p-6 shadow-medium md:p-8">
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
                      onChange={(event) => setDescription(event.target.value)}
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
                      <div className="grid animate-fade-in gap-4 pt-4 md:grid-cols-3">
                        <div>
                          <Label htmlFor="name">{t('step1.contactName')}</Label>
                          <Input
                            id="name"
                            value={contactName}
                            onChange={(event) => setContactName(event.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="phone">{t('step1.contactPhone')}</Label>
                          <Input
                            id="phone"
                            value={contactPhone}
                            onChange={(event) => setContactPhone(event.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="email">{t('step1.contactEmail')}</Label>
                          <Input
                            id="email"
                            type="email"
                            value={contactEmail}
                            onChange={(event) => setContactEmail(event.target.value)}
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
                    disabled={analyzing}
                  >
                    {analyzing ? (
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

              {currentStep === 2 && clarificationHistory.length > 0 && currentQuestion && (
                <ClarificationChat
                  history={clarificationHistory}
                  onSubmitAnswer={handleClarificationAnswer}
                  isProcessing={analyzing}
                />
              )}

              {currentStep === 3 && complaintPreview && complaintDraft && (
                <div className="space-y-6">
                  <ComplaintCard complaint={complaintPreview} />

                  <div className="flex gap-4">
                    <Button
                      variant='outline'
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
                      disabled={submitting}
                    >
                      {submitting ? (
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
