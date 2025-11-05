import { ChangeEvent, FormEvent, useCallback, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Header } from '@/components/Layout/Header';
import { Footer } from '@/components/Layout/Footer';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, Eye, Loader2, LogOut, Lock, RotateCcw, Save } from 'lucide-react';
import { RouteProblemsChart } from '@/components/Admin/RouteProblemsChart';
import { PriorityDistributionChart } from '@/components/Admin/PriorityDistributionChart';
import { AspectFrequencyChart } from '@/components/Admin/AspectFrequencyChart';
import { HeatmapChart } from '@/components/Admin/HeatmapChart';
import { fetchAnalyticsSummary, fetchComplaints, updateComplaint } from '@/services/api';
import { ComplaintRecord, ComplaintStatus, ComplaintTuple, Priority } from '@/types/complaint';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';

const priorityOrder: Priority[] = ['critical', 'high', 'medium', 'low'];
const statusOrder: ComplaintStatus[] = ['pending', 'approved', 'resolved', 'rejected'];
const TABLE_PAGE_SIZE = 25;

const Admin = () => {
  const [authorization, setAuthorization] = useState<string | null>(null);

  const handleLoginSuccess = useCallback((authHeader: string) => {
    setAuthorization(authHeader);
  }, []);

  const handleLogout = useCallback(() => {
    setAuthorization(null);
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30 py-8">
        {authorization ? (
          <AdminDashboard authorization={authorization} onLogout={handleLogout} />
        ) : (
          <AdminLogin onSuccess={handleLoginSuccess} />
        )}
      </main>
      <Footer showLinks={false} />
    </div>
  );
};

interface AdminDashboardProps {
  authorization: string;
  onLogout: () => void;
}

const AdminDashboard = ({ authorization, onLogout }: AdminDashboardProps) => {
  const { t, language } = useLanguage();

  const {
    data: analyticsData,
    isLoading: isAnalyticsLoading,
    isError: isAnalyticsError,
    isFetching: isAnalyticsFetching,
    refetch: refetchAnalytics
  } = useQuery({
    queryKey: ['analytics-summary', authorization],
    queryFn: () => fetchAnalyticsSummary(authorization),
    refetchOnWindowFocus: false,
    enabled: Boolean(authorization)
  });

  const {
    data: complaintsData,
    isLoading: isComplaintsLoading,
    isError: isComplaintsError,
    error: complaintsError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching: isComplaintsFetching,
    refetch: refetchComplaints
  } = useInfiniteQuery({
    queryKey: ['complaints', { limit: TABLE_PAGE_SIZE }, authorization],
    queryFn: ({ pageParam }) =>
      fetchComplaints(
        {
          limit: TABLE_PAGE_SIZE,
          cursor: pageParam ?? undefined
        },
        authorization
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined,
    enabled: Boolean(authorization)
  });

  const complaints = useMemo(
    () => complaintsData?.pages.flatMap((page) => page.items) ?? [],
    [complaintsData]
  );

  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintRecord | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [statusForm, setStatusForm] = useState<{
    status: ComplaintStatus;
    adminComment: string;
  }>({ status: 'pending', adminComment: '' });
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const openComplaintDetails = useCallback((complaint: ComplaintRecord) => {
    setSelectedComplaint(complaint);
    setStatusForm({
      status: complaint.status ?? 'pending',
      adminComment: complaint.adminComment ?? ''
    });
    setIsDetailOpen(true);
  }, []);

  const handleDetailOpenChange = useCallback((open: boolean) => {
    setIsDetailOpen(open);
    if (!open) {
      setSelectedComplaint(null);
    }
  }, []);

  const handleStatusValueChange = useCallback((value: string) => {
    setStatusForm((prev) => ({ ...prev, status: value as ComplaintStatus }));
  }, []);

  const handleCommentChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setStatusForm((prev) => ({ ...prev, adminComment: event.target.value }));
  }, []);

  const refreshAll = useCallback(() => {
    void Promise.all([refetchAnalytics(), refetchComplaints()]);
  }, [refetchAnalytics, refetchComplaints]);

  const handleStatusSubmit = useCallback(async () => {
    if (!selectedComplaint) {
      return;
    }

    setIsUpdatingStatus(true);
    try {
      const payload = {
        status: statusForm.status,
        adminComment: statusForm.adminComment.trim().length > 0 ? statusForm.adminComment.trim() : null
      };

      const updated = await updateComplaint(selectedComplaint.id, payload, authorization);

      toast({
        title: t('admin.detail.updateSuccess'),
        description: t('admin.detail.updateSuccessDescription')
      });

      setSelectedComplaint(updated);
      setStatusForm({
        status: updated.status ?? payload.status,
        adminComment: updated.adminComment ?? ''
      });

      await Promise.all([refetchComplaints(), refetchAnalytics()]);
    } catch (error) {
      console.error('Failed to update complaint status:', error);
      toast({
        title: t('errors.title'),
        description: t('admin.detail.updateError'),
        variant: 'destructive'
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [authorization, refetchAnalytics, refetchComplaints, selectedComplaint, statusForm.adminComment, statusForm.status, t]);

  const isRefreshing =
    (isAnalyticsFetching && !!analyticsData) || (isComplaintsFetching && complaints.length > 0);

  const routeData = analyticsData?.topRoutes ?? [];

  const priorityData = useMemo(
    () =>
      priorityOrder.map((priority) => ({
        priority,
        count: analyticsData?.priorityDistribution?.[priority] ?? 0
      })),
    [analyticsData]
  );

  const aspectData = useMemo(
    () =>
      (analyticsData?.aspectFrequency ?? []).map((item) => ({
        aspect: aspectLabel(item.aspect, t),
        count: item.count
      })),
    [analyticsData, t]
  );

  const heatmapData = analyticsData?.timeOfDayHeatmap ?? [];

  const loadingCharts =
    (isAnalyticsLoading && !analyticsData) || (!analyticsData && isAnalyticsFetching);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language === 'kz' ? 'kk-KZ' : 'ru-RU', {
        dateStyle: 'short',
        timeStyle: 'short'
      }),
    [language]
  );

  const formatDateTime = useCallback(
    (value: string | null | undefined) => {
      if (!value) {
        return '—';
      }

      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return '—';
      }

      return dateFormatter.format(parsed);
    },
    [dateFormatter]
  );

  return (
    <div className="container mx-auto px-4 md:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1>{t('admin.title')}</h1>
        <div className="flex items-center gap-2">
          {isRefreshing && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
          )}
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            {t('admin.export')}
          </Button>
          <Button variant="ghost" size="icon" onClick={refreshAll} aria-label={t('admin.refresh')}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="gap-2" onClick={onLogout}>
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">{t('admin.auth.logout')}</span>
          </Button>
        </div>
      </div>

      <div className="mb-6">
        {isAnalyticsError && (
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
              {statusOrder.map((status) => (
                <option key={status}>{t(`admin.status.${status}`)}</option>
              ))}
            </select>
          </FilterField>
        </div>
      </div>

      <section className="flex flex-col gap-8">
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
      </section>

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
                <th className="px-4 py-3 text-right">{t('admin.table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isComplaintsLoading && complaints.length === 0 ? (
                <TableMessageRow label={t('admin.loading')} />
              ) : isComplaintsError ? (
                <TableMessageRow
                  label={
                    complaintsError instanceof Error
                      ? complaintsError.message
                      : t('admin.table.error')
                  }
                  tone="error"
                />
              ) : complaints.length === 0 ? (
                <TableMessageRow label={t('admin.table.empty')} />
              ) : (
                complaints.map((complaint) => (
                  <ComplaintsTableRow
                    key={complaint.id}
                    complaint={complaint}
                    t={t}
                    formatDateTime={formatDateTime}
                    onSelect={openComplaintDetails}
                  />
                ))
              )}
            </tbody>
          </table>
          {hasNextPage && (
            <div className="flex justify-center border-t px-4 pb-2 pt-4">
              <Button
                variant="ghost"
                className="gap-2"
                onClick={() => {
                  void fetchNextPage();
                }}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {t('admin.table.loadMore')}
              </Button>
            </div>
          )}
        </div>
      </div>
      <Dialog open={isDetailOpen} onOpenChange={handleDetailOpenChange}>
        <DialogContent className="max-w-3xl">
          {selectedComplaint ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {t('admin.detail.title', {
                    reference: selectedComplaint.referenceNumber ?? selectedComplaint.id
                  })}
                </DialogTitle>
                <DialogDescription>{t('admin.detail.description')}</DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <DetailItem
                    label={t('admin.detail.priority')}
                    value={translatePriority(selectedComplaint.priority, t)}
                  />
                  <DetailItem
                    label={t('admin.detail.status')}
                    value={translateStatus(selectedComplaint.status, t)}
                  />
                  <DetailItem
                    label={t('admin.detail.submissionTime')}
                    value={formatDateTime(selectedComplaint.submissionTime)}
                  />
                  <DetailItem
                    label={t('admin.detail.reportedTime')}
                    value={formatDateTime(selectedComplaint.reportedTime)}
                  />
                  <DetailItem
                    label={t('admin.detail.statusUpdatedAt')}
                    value={formatDateTime(selectedComplaint.statusUpdatedAt)}
                  />
                  <DetailItem
                    label={t('admin.detail.source')}
                    value={selectedComplaint.source ?? '—'}
                  />
                </div>

                <div>
                  <Label>{t('admin.detail.descriptionLabel')}</Label>
                  <p className="mt-2 whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm">
                    {selectedComplaint.rawText ?? '—'}
                  </p>
                </div>

                <div>
                  <Label>{t('admin.detail.tuples')}</Label>
                  {selectedComplaint.tuples.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">{t('admin.detail.noTuples')}</p>
                  ) : (
                    <ul className="mt-2 space-y-2 text-sm">
                      {selectedComplaint.tuples.map((tuple, index) => (
                        <li key={`${selectedComplaint.id}-tuple-${index}`} className="rounded-lg border p-3">
                          {formatTupleSummary(tuple, t)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <Label>{t('admin.detail.contact')}</Label>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {formatContactInfo(selectedComplaint, t)}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr,2fr] md:items-start">
                  <div>
                    <Label>{t('admin.detail.statusControl')}</Label>
                    <Select value={statusForm.status} onValueChange={handleStatusValueChange}>
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder={t('admin.detail.statusPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOrder.map((status) => (
                          <SelectItem key={status} value={status}>
                            {t(`admin.status.${status}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t('admin.detail.commentLabel')}</Label>
                    <Textarea
                      className="mt-2"
                      rows={5}
                      value={statusForm.adminComment}
                      onChange={handleCommentChange}
                      placeholder={t('admin.detail.commentPlaceholder')}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-6 flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => handleDetailOpenChange(false)}>
                  {t('admin.detail.close')}
                </Button>
                <Button onClick={handleStatusSubmit} disabled={isUpdatingStatus} className="gap-2">
                  {isUpdatingStatus && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  {!isUpdatingStatus && <Save className="h-4 w-4" />}
                  {t('admin.detail.save')}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {t('admin.detail.empty')}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface AdminLoginProps {
  onSuccess: (authorization: string) => void;
}

const AdminLogin = ({ onSuccess }: AdminLoginProps) => {
  const { t } = useLanguage();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setIsSubmitting(true);

      const authorization = `Basic ${btoa(`${username}:${password}`)}`;

      try {
        const response = await fetch('/api/admin/session', {
          method: 'POST',
          headers: {
            Authorization: authorization
          }
        });

        if (!response.ok) {
          setError(response.status === 401 ? t('admin.auth.invalid') : t('admin.auth.error'));
          return;
        }

        onSuccess(authorization);
        setPassword('');
      } catch (err) {
        console.error('Failed to establish admin session:', err);
        setError(t('admin.auth.error'));
      } finally {
        setIsSubmitting(false);
      }
    },
    [password, t, username, onSuccess]
  );

  return (
    <div className="container mx-auto flex h-full items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-soft">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold">{t('admin.auth.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('admin.auth.description')}</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2 text-left">
            <Label htmlFor="admin-username">{t('admin.auth.username')}</Label>
            <Input
              id="admin-username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2 text-left">
            <Label htmlFor="admin-password">{t('admin.auth.password')}</Label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {t('admin.auth.submit')}
          </Button>
        </form>
      </div>
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

const AnalyticsCard = ({ title, children, loading = false, loadingLabel }: AnalyticsCardProps) => (
  <article className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-8 shadow-xl">
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5"
    />
    <div className="relative flex h-full flex-col gap-6">
      <h3 className="text-2xl font-semibold tracking-tight">{title}</h3>
      {loading ? (
        <LoadingState label={loadingLabel} />
      ) : (
        <div className="rounded-2xl border border-border/40 bg-background/70 p-4">
          {children}
        </div>
      )}
    </div>
  </article>
);

const LoadingState = ({ label }: { label: string }) => (
  <div className="flex h-[26rem] items-center justify-center rounded-2xl border border-dashed border-border/60 bg-card/60 text-muted-foreground">
    <Loader2 className="mr-3 h-6 w-6 animate-spin" />
    <span className="text-sm font-medium uppercase tracking-wide">{label}</span>
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

const DetailItem = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-1 text-sm font-semibold">{value || '—'}</p>
  </div>
);

function aspectLabel(key: string, t: (token: string) => string) {
  const translationKey = `charts.aspects.${key}`;
  const translated = t(translationKey);
  return translated === translationKey ? key : translated;
}

function formatContactInfo(complaint: ComplaintRecord, t: (token: string) => string) {
  if (complaint.isAnonymous) {
    return t('admin.detail.anonymous');
  }

  const contact = complaint.contact;
  if (!contact) {
    return t('admin.detail.noContact');
  }

  const parts: string[] = [];
  if (contact.name) {
    parts.push(contact.name);
  }
  if (contact.phone) {
    parts.push(contact.phone);
  }
  if (contact.email) {
    parts.push(contact.email);
  }

  return parts.length > 0 ? parts.join(' • ') : t('admin.detail.noContact');
}

function formatTupleSummary(tuple: ComplaintTuple, t: (token: string) => string) {
  const parts: string[] = [];

  const routes = (tuple.objects ?? [])
    .filter((object) => object.type === 'route' && object.value?.trim())
    .map((object) => object.value.trim());
  if (routes.length > 0) {
    parts.push(`${t('admin.detail.routeLabel')}: ${routes.join(', ')}`);
  }

  const plates = (tuple.objects ?? [])
    .filter((object) => object.type === 'bus_plate' && object.value?.trim())
    .map((object) => object.value.trim());
  if (plates.length > 0) {
    parts.push(`${t('admin.detail.plateLabel')}: ${plates.join(', ')}`);
  }

  const placeValue = tuple.place?.value?.trim();
  if (placeValue) {
    parts.push(`${t('admin.detail.placeLabel')}: ${placeValue}`);
  }

  const timeValue = tuple.time?.trim();
  if (timeValue) {
    parts.push(`${t('admin.detail.timeLabel')}: ${timeValue}`);
  }

  const aspects = (tuple.aspects ?? []).map((aspect) => aspectLabel(aspect, t));
  if (aspects.length > 0) {
    parts.push(`${t('admin.detail.aspectsLabel')}: ${aspects.join(', ')}`);
  }

  return parts.join(' • ');
}

interface ComplaintsTableRowProps {
  complaint: ComplaintRecord;
  t: (token: string) => string;
  formatDateTime: (value: string | null | undefined) => string;
  onSelect: (complaint: ComplaintRecord) => void;
}

const ComplaintsTableRow = ({ complaint, t, formatDateTime, onSelect }: ComplaintsTableRowProps) => {
  const reference = complaint.referenceNumber ?? complaint.id;
  const primaryRoute = extractPrimaryRoute(complaint);
  const timeLabel = formatComplaintTime(complaint, formatDateTime);

  return (
    <tr className="border-b">
      <td className="px-4 py-3">{reference}</td>
      <td className="px-4 py-3">{translatePriority(complaint.priority, t)}</td>
      <td className="px-4 py-3">{primaryRoute}</td>
      <td className="px-4 py-3">{timeLabel}</td>
      <td className="px-4 py-3">{translateStatus(complaint.status, t)}</td>
      <td className="px-4 py-3 text-right">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={() => onSelect(complaint)}
        >
          <Eye className="h-4 w-4" />
          {t('admin.table.view')}
        </Button>
      </td>
    </tr>
  );
};

const TableMessageRow = ({ label, tone = 'default' }: { label: string; tone?: 'default' | 'error' }) => (
  <tr className="border-b">
    <td
      colSpan={6}
      className={`px-4 py-8 text-center ${tone === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
    >
      {label}
    </td>
  </tr>
);

function translatePriority(priority: Priority | null, t: (token: string) => string) {
  if (!priority) {
    return '—';
  }

  const key = `priority.${priority}`;
  const translated = t(key);
  return translated === key ? priority : translated;
}

function translateStatus(status: ComplaintStatus | null, t: (token: string) => string) {
  if (!status) {
    return '—';
  }

  const key = `admin.status.${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

function extractPrimaryRoute(complaint: ComplaintRecord) {
  for (const tuple of complaint.tuples ?? []) {
    const routes =
      tuple?.objects
        ?.filter((object) => object?.type === 'route' && typeof object?.value === 'string')
        .map((object) => object.value.trim())
        .filter((value) => value.length > 0) ?? [];

    if (routes.length > 0) {
      return Array.from(new Set(routes)).join(', ');
    }
  }

  return '—';
}

function formatComplaintTime(
  complaint: ComplaintRecord,
  formatDateTime: (value: string | null | undefined) => string
) {
  const tupleTime = complaint.tuples?.[0]?.time;
  if (tupleTime && tupleTime.trim().length > 0) {
    return tupleTime;
  }

  return formatDateTime(complaint.submissionTime);
}
