import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { useLanguage } from '@/contexts/LanguageContext';

interface AspectData {
  aspect: string;
  count: number;
}

interface Props {
  data?: AspectData[];
}

export const AspectFrequencyChart = ({ data = [] }: Props) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const { t, language } = useLanguage();

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current);

    const aspectKeys = [
      'charts.aspects.driverConduct',
      'charts.aspects.delay',
      'charts.aspects.cleanliness',
      'charts.aspects.technical',
      'charts.aspects.routeChange',
    ] as const;

    const mockData: AspectData[] =
      data.length > 0
        ? data
        : [
            { aspect: t(aspectKeys[0]), count: 52 },
            { aspect: t(aspectKeys[1]), count: 45 },
            { aspect: t(aspectKeys[2]), count: 38 },
            { aspect: t(aspectKeys[3]), count: 30 },
            { aspect: t(aspectKeys[4]), count: 22 },
          ];

    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: 'hsl(var(--muted-foreground) / 0.3)' } },
        axisLabel: { color: 'hsl(var(--foreground))' },
        splitLine: { lineStyle: { color: 'hsl(var(--muted-foreground) / 0.1)' } },
      },
      yAxis: {
        type: 'category',
        data: mockData.map(d => d.aspect),
        axisLine: { lineStyle: { color: 'hsl(var(--muted-foreground) / 0.3)' } },
        axisLabel: { 
          color: 'hsl(var(--foreground))',
          fontSize: 11,
        },
      },
      series: [
        {
          data: mockData.map(d => d.count),
          type: 'bar',
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: 'hsl(var(--accent))' },
              { offset: 1, color: 'hsl(var(--primary))' },
            ]),
            borderRadius: [0, 8, 8, 0],
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
