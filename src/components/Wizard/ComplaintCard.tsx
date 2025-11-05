import { useMemo, type ReactNode } from 'react';
import { ComplaintPreview, ComplaintTuple, TupleObject } from '@/types/complaint';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { MapPin, Clock, Bus, FileText, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ComplaintCardProps {
  complaint: ComplaintPreview;
}

const priorityStyles = {
  low: 'bg-priority-low text-priority-low-foreground',
  medium: 'bg-priority-medium text-foreground',
  high: 'bg-priority-high text-foreground',
  critical: 'bg-priority-critical text-destructive-foreground'
} as const;

export const ComplaintCard = ({ complaint }: ComplaintCardProps) => {
  const { t, language } = useLanguage();

  const formattedSubmissionTime = useMemo(() => {
    const locale = language === 'kz' ? 'kk-KZ' : 'ru-RU';
    if (complaint.submissionTime) {
      return new Date(complaint.submissionTime).toLocaleString(locale);
    }
    return new Date().toLocaleString(locale);
  }, [complaint.submissionTime, language]);

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-medium animate-scale-in">
      <div className="bg-gradient-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-bold">{t('step3.preview')}</h3>
            <p className="mt-1 text-muted-foreground">{formattedSubmissionTime}</p>
          </div>
          <Badge className={cn('text-base px-4 py-2', priorityStyles[complaint.priority])}>
            {t(`priority.${complaint.priority}`)}
          </Badge>
        </div>
      </div>

      <div className="space-y-6 p-6">
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>{t('step3.descriptionLabel')}</span>
          </div>
          <p className="text-lg">{complaint.description}</p>
        </section>

        {complaint.tuples.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ListChecks className="h-4 w-4" />
              <h4 className="font-semibold">{t('step3.details')}</h4>
            </div>

            <div className="grid gap-3">
              {complaint.tuples.map((tuple, index) => {
                const routes = extractValues(tuple.objects, 'route');
                const plates = extractValues(tuple.objects, 'bus_plate');
                const aspects = tuple.aspects.join(', ');

                return (
                  <div key={`${tuple.time}-${index}`} className="space-y-2 rounded-lg border bg-muted/30 p-4">
                    {routes.length > 0 && (
                      <Line icon={<Bus className="h-4 w-4 text-primary" />} label={t('step3.route')}>
                        {routes.join(', ')}
                      </Line>
                    )}
                    {plates.length > 0 && (
                      <Line icon={<Bus className="h-4 w-4 text-primary" />} label={t('step3.plate')}>
                        {plates.join(', ')}
                      </Line>
                    )}
                    {tuple.place?.value && (
                      <Line icon={<MapPin className="h-4 w-4 text-primary" />} label={t('step3.location')}>
                        {tuple.place.value}
                      </Line>
                    )}
                    {tuple.time && (
                      <Line icon={<Clock className="h-4 w-4 text-primary" />} label={t('step3.time')}>
                        {tuple.time === 'submission_time' ? formattedSubmissionTime : tuple.time}
                      </Line>
                    )}
                    {aspects && (
                      <Line icon={<ListChecks className="h-4 w-4 text-primary" />} label={t('step3.aspect')}>
                        {aspects}
                      </Line>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {complaint.mediaFiles.length > 0 && (
          <section className="space-y-2">
            <h4 className="font-semibold">
              {t('step3.media')} ({complaint.mediaFiles.length})
            </h4>
            <div className="grid grid-cols-3 gap-2">
              {complaint.mediaFiles.slice(0, 3).map((media) => (
                <div key={media.id} className="aspect-square overflow-hidden rounded-lg border bg-muted">
                  {media.type === 'image' && (
                    <img src={media.preview} alt="Preview" className="h-full w-full object-cover" />
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {complaint.recommendation && (
          <section className="rounded-lg bg-accent/30 p-4">
            <h4 className="mb-2 font-semibold">{t('step3.recommendation')}</h4>
            <p>{complaint.recommendation}</p>
          </section>
        )}

        {!complaint.isAnonymous && complaint.contact && (
          <section className="space-y-2 rounded-lg border-l-4 border-primary bg-muted/30 p-4">
            <h4 className="font-semibold">{t('step3.contact')}</h4>
            {complaint.contact.name && (
              <p>
                {t('step3.contactNameLabel')}: {complaint.contact.name}
              </p>
            )}
            {complaint.contact.phone && (
              <p>
                {t('step3.contactPhoneLabel')}: {complaint.contact.phone}
              </p>
            )}
            {complaint.contact.email && (
              <p>
                {t('step3.contactEmailLabel')}: {complaint.contact.email}
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

interface LineProps {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}

const Line = ({ icon, label, children }: LineProps) => (
  <div className="flex items-center gap-2">
    {icon}
    <span className="font-medium">{label}:</span>
    <span>{children}</span>
  </div>
);

function extractValues(objects: TupleObject[], type: ComplaintTuple['objects'][number]['type']) {
  return objects.filter((item) => item.type === type).map((item) => item.value);
}
