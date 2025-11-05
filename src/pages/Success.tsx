import { useLocation, useNavigate } from 'react-router-dom';
import { Header } from '@/components/Layout/Header';
import { Footer } from '@/components/Layout/Footer';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { CheckCircle2 } from 'lucide-react';

const Success = () => {
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const referenceNumber = location.state?.referenceNumber || 'N/A';

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      
      <main className="flex flex-1 items-center justify-center bg-gradient-hero/20 px-4 py-16">
        <div className="w-full max-w-md animate-scale-in">
          <div className="rounded-2xl border bg-card p-8 text-center shadow-large">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-accent">
              <CheckCircle2 className="h-10 w-10 text-accent-foreground" />
            </div>
            
            <h1 className="mb-4">{t('step4.success')}</h1>
            
            <div className="mb-6 rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground">
                {t('step4.referenceNumber')}
              </p>
              <p className="mt-2 text-2xl font-bold text-primary">
                {referenceNumber}
              </p>
            </div>

            <p className="mb-8 text-muted-foreground">
              {t('step4.processing')}
            </p>

            <Button
              size="lg"
              className="w-full"
              onClick={() => navigate('/')}
            >
              {t('step4.newComplaint')}
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Success;
