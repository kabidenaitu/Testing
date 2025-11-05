import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Globe, Type } from 'lucide-react';

export const Header = () => {
  const { language, setLanguage, t } = useLanguage();

  const toggleLargeText = () => {
    document.body.classList.toggle('text-large');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card/80 backdrop-blur-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-accent" />
          <span className="text-xl font-bold">{t('header.title')}</span>
        </Link>

        <div className="flex items-center gap-2 md:gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLanguage(language === 'kz' ? 'ru' : 'kz')}
            className="gap-2"
          >
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">{language.toUpperCase()}</span>
          </Button>

          <Button variant="ghost" size="sm" onClick={toggleLargeText} className="gap-2">
            <Type className="h-4 w-4" />
            <span className="hidden sm:inline">{t('header.largeText')}</span>
          </Button>

          <Link to="/admin">
            <Button variant="outline" size="sm">
              {t('header.admin')}
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
};
