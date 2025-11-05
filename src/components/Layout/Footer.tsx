import { useLanguage } from '@/contexts/LanguageContext';

interface FooterProps {
  showLinks?: boolean;
}

export const Footer = ({ showLinks = true }: FooterProps) => {
  const { t } = useLanguage();
  const containerClasses = `flex flex-col items-center gap-4 md:flex-row ${
    showLinks ? 'md:justify-between' : 'md:justify-center'
  }`;

  return (
    <footer className="mt-auto border-t bg-card py-8">
      <div className="container mx-auto px-4 md:px-6">
        <div className={containerClasses}>
          <p className="text-center text-sm text-muted-foreground md:text-left">
            © 2025 {t('header.title')}
          </p>
          {showLinks && (
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
          )}
        </div>
      </div>
    </footer>
  );
};
