import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/Layout/Header';
import { Footer } from '@/components/Layout/Footer';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Download, Loader2, RotateCcw } from 'lucide-react';
import { RouteProblemsChart } from '@/components/Admin/RouteProblemsChart';
import { PriorityDistributionChart } from '@/components/Admin/PriorityDistributionChart';
import { AspectFrequencyChart } from '@/components/Admin/AspectFrequencyChart';
import { HeatmapChart } from '@/components/Admin/HeatmapChart';
import { fetchAnalyticsSummary } from '@/services/api';
import { Priority } from '@/types/complaint';

const priorityOrder: Priority[] = ['critical', 'high', 'medium', 'low'];

const Admin = () => {
  const { t } = useLanguage();

  const {
    data,
    isLoading,
    isError,
    isFetching,
    refetch
  } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: fetchAnalyticsSummary,
    refetchOnWindowFocus: false
  });

  const routeData = data?.topRoutes ?? [];

  const priorityData = useMemo(
    () =>
      priorityOrder.map((priority) => ({
        priority,
        count: data?.priorityDistribution?.[priority] ?? 0
      })),
    [data]
  );

  const aspectData = useMemo(
    () =>
      (data?.aspectFrequency ?? []).map((item) => ({
        aspect: aspectLabel(item.aspect, t),
        count: item.count
      })),
    [data, t]
  );

  const heatmapData = data?.timeOfDayHeatmap ?? [];

  const loadingCharts = (isLoading && !data) || (!data && isFetching);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 bg-muted/30 py-8">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <h1>{t('admin.title')}</h1>
            <div className="flex items-center gap-2">
              {isFetching && data && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
              )}
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                {t('admin.export')}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => refetch()} aria-label={t('admin.refresh')}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mb-6">
            {isError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {t('admin.loadError')}
              </div>
            )}
          </div>

          <div className="mb-8 rounded-2xl border bg-card p-6 shadow-soft">
            <h3 className="mb-4">{t('admin.filters')}</h3>
            <div className="grid gap-4 md:grid-cols-4">
              <FilterField label={t('admin.dateRange')}>
                <input type="date" className="mt-1 w-full rounded-lg border px-3 py-2" />
              </FilterField>
              <FilterField label={t('admin.priorityLabel')}>
                <select className="mt-1 w-full rounded-lg border px-3 py-2">
                  <option>{t('priority.all')}</option>
                  {priorityOrder.map((priority) => (
                    <option key={priority}>{t(`priority.${priority}`)}</option>
                  ))}
                </select>
              </FilterField>
              <FilterField label={t('step3.route')}>
                <input type="text" className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="№" />
              </FilterField>
              <FilterField label={t('admin.statusLabel')}>
                <select className="mt-1 w-full rounded-lg border px-3 py-2">
                  <option>{t('admin.status.all')}</option>
                  <option>{t('admin.status.new')}</option>
                  <option>{t('admin.status.inProgress')}</option>
                  <option>{t('admin.status.closed')}</option>
                </select>
              </FilterField>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <AnalyticsCard
              title={t('admin.cards.routes')}
              loading={loadingCharts}
              loadingLabel={t('admin.loading')}
            >
              <RouteProblemsChart data={routeData} />
            </AnalyticsCard>

            <AnalyticsCard
              title={t('admin.cards.priorityDistribution')}
              loading={loadingCharts}
              loadingLabel={t('admin.loading')}
            >
              <PriorityDistributionChart data={priorityData} />
            </AnalyticsCard>

            <AnalyticsCard
              title={t('admin.cards.aspectFrequency')}
              loading={loadingCharts}
              loadingLabel={t('admin.loading')}
            >
              <AspectFrequencyChart data={aspectData} />
            </AnalyticsCard>

            <AnalyticsCard
              title={t('admin.cards.heatmap')}
              loading={loadingCharts}
              loadingLabel={t('admin.loading')}
            >
              <HeatmapChart data={heatmapData} />
            </AnalyticsCard>
          </div>

          <div className="mt-6 rounded-2xl border bg-card p-6 shadow-soft">
            <h3 className="mb-4">{t('admin.complaints')}</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-3 text-left">{t('admin.table.id')}</th>
                    <th className="px-4 py-3 text-left">{t('admin.table.priority')}</th>
                    <th className="px-4 py-3 text-left">{t('admin.table.route')}</th>
                    <th className="px-4 py-3 text-left">{t('admin.table.time')}</th>
                    <th className="px-4 py-3 text-left">{t('admin.table.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      {t('admin.table.empty')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Admin;

interface AnalyticsCardProps {
  title: string;
  children: React.ReactNode;
  loading?: boolean;
  loadingLabel: string;
}

const AnalyticsCard = ({ title, children, loading = false, loadingLabel }: AnalyticsCardProps) => {
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-soft">
      <h3 className="mb-4">{title}</h3>
      {loading ? <LoadingState label={loadingLabel} /> : children}
    </div>
  );
};

const LoadingState = ({ label }: { label: string }) => (
  <div className="flex h-64 items-center justify-center text-muted-foreground">
    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
    <span>{label}</span>
  </div>
);

interface FilterFieldProps {
  label: string;
  children: React.ReactNode;
}

const FilterField = ({ label, children }: FilterFieldProps) => (
  <div>
    <label className="text-sm font-medium">{label}</label>
    {children}
  </div>
);

function aspectLabel(key: string, t: (token: string) => string) {
  const translationKey = `charts.aspects.${key}`;
  const translated = t(translationKey);
  return translated === translationKey ? key : translated;
}
