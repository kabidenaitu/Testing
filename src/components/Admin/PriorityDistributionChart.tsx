import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts';
import { useLanguage } from '@/contexts/LanguageContext';
import { Priority } from '@/types/complaint';

interface PriorityPoint {
  priority: Priority;
  count: number;
}

interface Props {
  data?: PriorityPoint[];
}

const priorityOrder: Priority[] = ['critical', 'high', 'medium', 'low'];

export const PriorityDistributionChart = ({ data = [] }: Props) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  const orderedData = useMemo(() => {
    const map = new Map(data.map((item) => [item.priority, item.count]));
    return priorityOrder.map((priority) => ({
      priority,
      count: map.get(priority) ?? 0
    }));
  }, [data]);

  const total = orderedData.reduce((acc, item) => acc + item.count, 0);

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }

    const chart = echarts.init(chartRef.current);

    const option = {
      tooltip: {
        trigger: 'item',
        formatter: ({ name, value }: { name: string; value: number }) =>
          `${name}: ${value}`
      },
      xAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: 'hsl(var(--muted-foreground) / 0.3)' } },
        axisLabel: { color: 'hsl(var(--foreground))' },
        splitLine: { lineStyle: { color: 'hsl(var(--muted-foreground) / 0.1)' } }
      },
      yAxis: {
        type: 'category',
        data: orderedData.map((item) => t(`priority.${item.priority}`)),
        axisLine: { lineStyle: { color: 'hsl(var(--muted-foreground) / 0.3)' } },
        axisLabel: { color: 'hsl(var(--foreground))' }
      },
      series: [
        {
          type: 'bar',
          data: orderedData.map((item) => ({
            value: item.count,
            itemStyle: { color: colorForPriority(item.priority) }
          })),
          barWidth: 18,
          label: {
            show: true,
            position: 'right',
            color: 'hsl(var(--foreground))'
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
  }, [orderedData, t]);

  return (
    <div className="relative h-64 w-full">
      <div ref={chartRef} className="h-full w-full" />
      {total === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {t('admin.noData')}
        </div>
      )}
    </div>
  );
};

function colorForPriority(priority: Priority) {
  switch (priority) {
    case 'critical':
      return 'hsl(var(--priority-critical))';
    case 'high':
      return 'hsl(var(--priority-high))';
    case 'medium':
      return 'hsl(var(--priority-medium))';
    case 'low':
    default:
      return 'hsl(var(--priority-low))';
  }
}
