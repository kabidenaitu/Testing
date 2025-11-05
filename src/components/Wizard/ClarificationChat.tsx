import { useMemo, useState } from 'react';
import { ClarificationHistoryItem } from '@/types/complaint';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  history: ClarificationHistoryItem[];
  onSubmitAnswer: (slot: string, answer: string) => Promise<void> | void;
  isProcessing?: boolean;
}

export const ClarificationChat = ({ history, onSubmitAnswer, isProcessing = false }: Props) => {
  const { t } = useLanguage();
  const [currentAnswer, setCurrentAnswer] = useState('');

  const currentQuestion = useMemo(
    () => history.find((item) => !item.answer),
    [history]
  );

  const total = history.length;
  const answered = history.filter((item) => Boolean(item.answer)).length;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentQuestion || !currentAnswer.trim()) {
      return;
    }

    await onSubmitAnswer(currentQuestion.slot, currentAnswer.trim());
    setCurrentAnswer('');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-lg bg-muted/30 p-4">
        <h3 className="mb-2 text-lg font-medium">{t('step2.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('step2.description')}</p>
        {total > 0 && (
          <div className="mt-4 flex gap-2">
            {history.map((item) => (
              <div
                key={item.slot}
                className={`h-2 flex-1 rounded-full transition-all ${
                  item.answer ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4 max-h-96 overflow-y-auto">
        {history.map((item) => (
          <div key={item.slot} className="space-y-2">
            <div className="flex justify-start animate-slide-in">
              <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-primary/10 px-4 py-3">
                <p className="text-sm font-medium">{item.question}</p>
              </div>
            </div>

            {item.answer && (
              <div className="flex justify-end animate-slide-in">
                <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-primary-foreground">
                  <p className="text-sm">{item.answer}</p>
                  <CheckCircle2 className="mt-1 ml-auto h-4 w-4" />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {currentQuestion ? (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={currentAnswer}
            onChange={(event) => setCurrentAnswer(event.target.value)}
            placeholder={t('step2.placeholder')}
            className="flex-1"
            autoFocus
            disabled={isProcessing}
          />
          <Button type="submit" size="icon" disabled={!currentAnswer.trim() || isProcessing}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      ) : (
        <div className="text-center animate-fade-in">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-primary">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">
              {t('step2.complete')} ({answered}/{total})
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
