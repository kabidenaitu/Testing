import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface RouteData {
  route: string;
  count: number;
}

interface Props {
  data?: RouteData[];
}

export const RouteProblemsChart = ({ data = [] }: Props) => {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current);

    const mockData: RouteData[] = data.length > 0 ? data : [
      { route: '№10', count: 45 },
      { route: '№23', count: 38 },
      { route: '№5', count: 32 },
      { route: '№18', count: 28 },
      { route: '№7', count: 24 },
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
        type: 'category',
        data: mockData.map(d => d.route),
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
          data: mockData.map(d => d.count),
          type: 'bar',
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'hsl(var(--priority-high))' },
              { offset: 1, color: 'hsl(var(--priority-medium))' },
            ]),
            borderRadius: [8, 8, 0, 0],
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
  }, [data]);

  return <div ref={chartRef} className="h-64 w-full" />;
};
