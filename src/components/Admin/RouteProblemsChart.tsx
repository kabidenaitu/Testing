import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { useLanguage } from '@/contexts/LanguageContext';

interface RouteData {
  route: string;
  count: number;
}

interface Props {
  data?: RouteData[];
}

export const RouteProblemsChart = ({ data = [] }: Props) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }

    const chart = echarts.init(chartRef.current);

    const seriesData = data.slice(0, 10);

    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: seriesData.map((item) => item.route),
        axisLine: { lineStyle: { color: 'hsl(var(--muted-foreground) / 0.3)' } },
        axisLabel: { color: 'hsl(var(--foreground))' }
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: 'hsl(var(--muted-foreground) / 0.3)' } },
        axisLabel: { color: 'hsl(var(--foreground))' },
        splitLine: { lineStyle: { color: 'hsl(var(--muted-foreground) / 0.1)' } }
      },
      series: [
        {
          data: seriesData.map((item) => item.count),
          type: 'bar',
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'hsl(var(--priority-high))' },
              { offset: 1, color: 'hsl(var(--priority-medium))' }
            ]),
            borderRadius: [8, 8, 0, 0]
          },
          animationDuration: 600
        }
      ]
    };

    chart.setOption(option);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [data, t]);

  return (
    <div className="relative h-64 w-full">
      <div ref={chartRef} className="h-full w-full" />
      {data.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {t('admin.noData')}
        </div>
      )}
    </div>
  );
};
