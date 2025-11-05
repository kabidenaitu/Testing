import { Header } from '@/components/Layout/Header';
import { Footer } from '@/components/Layout/Footer';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { RouteProblemsChart } from '@/components/Admin/RouteProblemsChart';
import { PriorityDistributionChart } from '@/components/Admin/PriorityDistributionChart';
import { AspectFrequencyChart } from '@/components/Admin/AspectFrequencyChart';
import { HeatmapChart } from '@/components/Admin/HeatmapChart';

const Admin = () => {
  const { t } = useLanguage();

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      
      <main className="flex-1 bg-muted/30 py-8">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mb-8 flex items-center justify-between">
            <h1>{t('admin.title')}</h1>
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              {t('admin.export')}
            </Button>
          </div>

          {/* Filters */}
          <div className="mb-8 rounded-2xl border bg-card p-6 shadow-soft">
            <h3 className="mb-4">{t('admin.filters')}</h3>
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <label className="text-sm font-medium">{t('admin.dateRange')}</label>
                <input type="date" className="mt-1 w-full rounded-lg border px-3 py-2" />
              </div>
              <div>
                <label className="text-sm font-medium">{t('admin.priorityLabel')}</label>
                <select className="mt-1 w-full rounded-lg border px-3 py-2">
                  <option>{t('priority.all')}</option>
                  <option>{t('priority.critical')}</option>
                  <option>{t('priority.high')}</option>
                  <option>{t('priority.medium')}</option>
                  <option>{t('priority.low')}</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">{t('step3.route')}</label>
                <input type="text" className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="№" />
              </div>
              <div>
                <label className="text-sm font-medium">{t('admin.statusLabel')}</label>
                <select className="mt-1 w-full rounded-lg border px-3 py-2">
                  <option>{t('admin.status.all')}</option>
                  <option>{t('admin.status.new')}</option>
                  <option>{t('admin.status.inProgress')}</option>
                  <option>{t('admin.status.closed')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Dashboard */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border bg-card p-6 shadow-soft">
              <h3 className="mb-4">{t('admin.cards.routes')}</h3>
              <RouteProblemsChart />
            </div>
            
            <div className="rounded-2xl border bg-card p-6 shadow-soft">
              <h3 className="mb-4">{t('admin.cards.priorityDistribution')}</h3>
              <PriorityDistributionChart />
            </div>
            
            <div className="rounded-2xl border bg-card p-6 shadow-soft">
              <h3 className="mb-4">{t('admin.cards.aspectFrequency')}</h3>
              <AspectFrequencyChart />
            </div>
            
            <div className="rounded-2xl border bg-card p-6 shadow-soft">
              <h3 className="mb-4">{t('admin.cards.heatmap')}</h3>
              <HeatmapChart />
            </div>
          </div>

          {/* Table Placeholder */}
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
