import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { useLanguage } from '@/contexts/LanguageContext';

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

    // Generate mock data if not provided
    const mockData: HeatmapData[] = data.length > 0 ? data : [];
    if (mockData.length === 0) {
      for (let d = 0; d < 7; d++) {
        for (let h = 0; h < 24; h++) {
          const isRushHour = (h >= 7 && h <= 9) || (h >= 17 && h <= 19);
          const isWeekday = d < 5;
          const baseCount = isRushHour && isWeekday ? 15 : 5;
          mockData.push({
            day: d,
            hour: h,
            count: baseCount + Math.floor(Math.random() * 10),
          });
        }
      }
    }

    const chartData = mockData.map(item => [item.hour, item.day, item.count]);
    const maxCount = Math.max(...mockData.map(d => d.count));

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
          color: 'hsl(var(--foreground))',
          interval: 2,
          fontSize: 10,
        },
        axisLine: { show: false },
      },
      yAxis: {
        type: 'category',
        data: days,
        splitArea: { show: true },
        axisLabel: { color: 'hsl(var(--foreground))' },
        axisLine: { show: false },
      },
      visualMap: {
        min: 0,
        max: maxCount,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '0%',
        textStyle: { color: 'hsl(var(--foreground))' },
        inRange: {
          color: [
            'hsl(var(--priority-low))',
            'hsl(var(--priority-medium))',
            'hsl(var(--priority-high))',
            'hsl(var(--priority-critical))',
          ],
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

  return <div ref={chartRef} className="h-64 w-full" />;
};
