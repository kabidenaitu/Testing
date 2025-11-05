import { Complaint } from '@/types/complaint';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { Edit2, MapPin, Clock, Bus, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ComplaintCardProps {
  complaint: Complaint;
  onEdit?: (section: string) => void;
  showEdit?: boolean;
}

export const ComplaintCard = ({ complaint, onEdit, showEdit = false }: ComplaintCardProps) => {
  const { t, language } = useLanguage();

  const priorityColors = {
    low: 'bg-priority-low text-priority-low-foreground',
    medium: 'bg-priority-medium text-foreground',
    high: 'bg-priority-high text-foreground',
    critical: 'bg-priority-critical text-destructive-foreground',
  };

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-medium animate-scale-in">
      <div className="bg-gradient-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-2xl font-bold">{t('step3.preview')}</h3>
            <p className="mt-1 text-muted-foreground">
              {new Date().toLocaleString(language === 'kz' ? 'kk-KZ' : 'ru-RU')}
            </p>
          </div>
          <Badge className={cn('text-base px-4 py-2', priorityColors[complaint.priority])}>
            {t(`priority.${complaint.priority}`)}
          </Badge>
        </div>
      </div>

      <div className="space-y-6 p-6">
        {/* Description */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>{t('step3.descriptionLabel')}</span>
            </div>
            {showEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit?.('description')}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="text-lg">{complaint.description}</p>
        </div>

        {/* Tuples */}
        {complaint.tuples.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">{t('step3.details')}</h4>
              {showEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit?.('tuples')}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="grid gap-3">
              {complaint.tuples.map((tuple, index) => (
                <div
                  key={index}
                  className="rounded-lg border bg-muted/30 p-4 space-y-2"
                >
                  {tuple.route && (
                    <div className="flex items-center gap-2">
                      <Bus className="h-4 w-4 text-primary" />
                      <span className="font-medium">{t('step3.route')}:</span>
                      <span>{tuple.route}</span>
                    </div>
                  )}
                  {tuple.plate && (
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t('step3.plate')}:</span>
                      <span>{tuple.plate}</span>
                    </div>
                  )}
                  {tuple.location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      <span className="font-medium">{t('step3.location')}:</span>
                      <span>{tuple.location}</span>
                    </div>
                  )}
                  {tuple.time && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      <span className="font-medium">{t('step3.time')}:</span>
                      <span>{tuple.time}</span>
                    </div>
                  )}
                  {tuple.aspect && (
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t('step3.aspect')}:</span>
                      <span>{tuple.aspect}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Media */}
        {complaint.media.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">
                {t('step3.media')} ({complaint.media.length})
              </h4>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {complaint.media.slice(0, 3).map((media) => (
                <div
                  key={media.id}
                  className="aspect-square overflow-hidden rounded-lg border bg-muted"
                >
                  {media.type === 'image' && (
                    <img
                      src={media.preview}
                      alt="Media"
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendation */}
        {complaint.recommendation && (
          <div className="rounded-lg bg-accent/30 p-4">
            <h4 className="mb-2 font-semibold">{t('step3.recommendation')}</h4>
            <p>{complaint.recommendation}</p>
          </div>
        )}

        {/* Contact */}
        {!complaint.isAnonymous && (
          <div className="space-y-2 rounded-lg border-l-4 border-primary bg-muted/30 p-4">
            <h4 className="font-semibold">{t('step3.contact')}</h4>
            {complaint.contactName && (
              <p>
                {t('step3.contactNameLabel')}: {complaint.contactName}
              </p>
            )}
            {complaint.contactPhone && (
              <p>
                {t('step3.contactPhoneLabel')}: {complaint.contactPhone}
              </p>
            )}
            {complaint.contactEmail && (
              <p>
                {t('step3.contactEmailLabel')}: {complaint.contactEmail}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
