import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { useLanguage } from '@/contexts/LanguageContext';

interface PriorityData {
  date: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface Props {
  data?: PriorityData[];
}

export const PriorityDistributionChart = ({ data = [] }: Props) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const { t, language } = useLanguage();

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current);

    const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
    const localizedDays = dayKeys.map((key) => t(`charts.days.${key}`));

    const mockData: PriorityData[] =
      data.length > 0
        ? data
        : [
            { date: localizedDays[0], critical: 5, high: 12, medium: 18, low: 8 },
            { date: localizedDays[1], critical: 8, high: 15, medium: 22, low: 10 },
            { date: localizedDays[2], critical: 6, high: 18, medium: 20, low: 12 },
            { date: localizedDays[3], critical: 10, high: 16, medium: 24, low: 9 },
            { date: localizedDays[4], critical: 12, high: 20, medium: 28, low: 15 },
            { date: localizedDays[5], critical: 4, high: 10, medium: 15, low: 7 },
            { date: localizedDays[6], critical: 3, high: 8, medium: 12, low: 6 },
          ];

    const priorityKeys = ['critical', 'high', 'medium', 'low'] as const;
    const legendLabels = priorityKeys.map((key) => t(`priority.${key}`));

    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
      },
      legend: {
        data: legendLabels,
        textStyle: { color: 'hsl(var(--foreground))' },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: mockData.map(d => d.date),
        axisLine: { lineStyle: { color: 'hsl(var(--muted-foreground) / 0.3)' } },
        axisLabel: { color: 'hsl(var(--foreground))' },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: 'hsl(var(--muted-foreground) / 0.3)' } },
        axisLabel: { color: 'hsl(var(--foreground))' },
        splitLine: { lineStyle: { color: 'hsl(var(--muted-foreground) / 0.1)' } },
      },
      series: [
        {
          name: t('priority.critical'),
          type: 'bar',
          stack: 'total',
          data: mockData.map(d => d.critical),
          itemStyle: { color: 'hsl(var(--priority-critical))' },
        },
        {
          name: t('priority.high'),
          type: 'bar',
          stack: 'total',
          data: mockData.map(d => d.high),
          itemStyle: { color: 'hsl(var(--priority-high))' },
        },
        {
          name: t('priority.medium'),
          type: 'bar',
          stack: 'total',
          data: mockData.map(d => d.medium),
          itemStyle: { color: 'hsl(var(--priority-medium))' },
        },
        {
          name: t('priority.low'),
          type: 'bar',
          stack: 'total',
          data: mockData.map(d => d.low),
          itemStyle: { color: 'hsl(var(--priority-low))' },
        },
      ],
      animationDuration: 1000,
    };

    chart.setOption(option);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [data, language, t]);

  return <div ref={chartRef} className="h-64 w-full" />;
};
