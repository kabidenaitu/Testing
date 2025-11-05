import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { useLanguage } from '@/contexts/LanguageContext';
import { getCssHslColor } from '@/lib/chartColors';

interface HeatmapData {
  day: number;
  hour: number;
  count: number;
}

interface Props {
  data?: HeatmapData[];
}

export const HeatmapChart = ({ data = [] }: Props) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const { t, language } = useLanguage();

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current);

    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
    const days = dayKeys.map((key) => t(`charts.days.${key}`));

    const normalized = data.map((item) => ({
      day: Math.max(0, Math.min(6, (item.day ?? 1) - 1)),
      hour: Math.max(0, Math.min(23, item.hour ?? 0)),
      count: item.count ?? 0
    }));

    const chartData = normalized.map((item) => [item.hour, item.day, item.count]);
    const maxCount = normalized.length > 0 ? Math.max(...normalized.map((d) => d.count)) : 1;

    const axisLabelColor = getCssHslColor('--foreground');
    const visualColors = [
      getCssHslColor('--priority-low'),
      getCssHslColor('--priority-medium'),
      getCssHslColor('--priority-high'),
      getCssHslColor('--priority-critical')
    ];

    const option = {
      tooltip: {
        position: 'top',
        formatter: (params: any) => {
          const [hour, day, count] = params.data;
          return `${days[day]} ${hours[hour]}<br/>${t('charts.heatmap.tooltip')}: ${count}`;
        },
      },
      grid: {
        left: '10%',
        right: '10%',
        top: '5%',
        bottom: '10%',
      },
      xAxis: {
        type: 'category',
        data: hours,
        splitArea: { show: true },
        axisLabel: { 
          color: axisLabelColor,
          interval: 2,
          fontSize: 10,
        },
        axisLine: { show: false },
      },
      yAxis: {
        type: 'category',
        data: days,
        splitArea: { show: true },
        axisLabel: { color: axisLabelColor },
        axisLine: { show: false },
      },
      visualMap: {
        min: 0,
        max: maxCount,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
        textStyle: { color: axisLabelColor },
        inRange: {
          color: visualColors,
        },
      },
      series: [
        {
          type: 'heatmap',
          data: chartData,
          label: { show: false },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)',
            },
          },
          animationDuration: 1000,
        },
      ],
    };

    chart.setOption(option);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.dispose();
    };
  }, [data, language, t]);

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
