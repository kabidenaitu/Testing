import { useLanguage } from '@/contexts/LanguageContext';

export const Footer = () => {
  const { t } = useLanguage();

  return (
    <footer className="mt-auto border-t bg-card py-8">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <p className="text-sm text-muted-foreground">
            © 2025 {t('header.title')}
          </p>
          <div className="flex gap-6">
            <a
              href="#about"
              className="text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              {t('footer.about')}
            </a>
            <a
              href="#privacy"
              className="text-sm text-muted-foreground transition-colors hover:text-primary"
            >
              {t('footer.privacy')}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
