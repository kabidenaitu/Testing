import { useState } from 'react';
import { ClarificationQuestion } from '@/types/complaint';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  questions: ClarificationQuestion[];
  onAnswer: (questionId: string, answer: string) => void;
  onComplete: () => void;
}

export const ClarificationChat = ({ questions, onAnswer, onComplete }: Props) => {
  const { t } = useLanguage();
  const [currentAnswer, setCurrentAnswer] = useState('');
  const unansweredQuestions = questions.filter(q => !q.answered);
  const currentQuestion = unansweredQuestions[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAnswer.trim() || !currentQuestion) return;

    onAnswer(currentQuestion.id, currentAnswer);
    setCurrentAnswer('');

    // If this was the last question, complete the step
    if (unansweredQuestions.length === 1) {
      setTimeout(() => onComplete(), 500);
    }
  };

  const allAnswered = questions.every(q => q.answered);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-lg bg-muted/30 p-4">
        <h3 className="mb-2 text-lg font-medium">{t('step2.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('step2.description')}</p>
        <div className="mt-4 flex gap-2">
          {questions.map((q) => (
            <div
              key={q.id}
              className={`h-2 flex-1 rounded-full transition-all ${
                q.answered ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Chat bubbles */}
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {questions.map((question) => (
          <div key={question.id} className="space-y-2">
            {/* Question bubble */}
            <div className="flex justify-start animate-slide-in">
              <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-primary/10 px-4 py-3">
                <p className="text-sm font-medium">{question.question}</p>
              </div>
            </div>

            {/* Answer bubble (if answered) */}
            {question.answered && question.answer && (
              <div className="flex justify-end animate-slide-in">
                <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-primary-foreground">
                  <p className="text-sm">{question.answer}</p>
                  <CheckCircle2 className="mt-1 h-4 w-4 ml-auto" />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input form */}
      {!allAnswered && currentQuestion && (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={currentAnswer}
            onChange={(e) => setCurrentAnswer(e.target.value)}
            placeholder={t('step2.placeholder')}
            className="flex-1"
            autoFocus
          />
          <Button type="submit" size="icon" disabled={!currentAnswer.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      )}

      {allAnswered && (
        <div className="text-center animate-fade-in">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-primary">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">{t('step2.complete')}</span>
          </div>
        </div>
      )}
    </div>
  );
};
