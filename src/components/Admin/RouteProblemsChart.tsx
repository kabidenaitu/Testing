import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { useLanguage } from '@/contexts/LanguageContext';
import { getCssHslColor } from '@/lib/chartColors';

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

    const axisLineColor = getCssHslColor('--muted-foreground', 0.3);
    const axisLabelColor = getCssHslColor('--foreground');
    const splitLineColor = getCssHslColor('--muted-foreground', 0.1);
    const barGradient = new echarts.graphic.LinearGradient(0, 0, 0, 1, [
      { offset: 0, color: getCssHslColor('--priority-high') },
      { offset: 1, color: getCssHslColor('--priority-medium') }
    ]);

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
        axisLine: { lineStyle: { color: axisLineColor } },
        axisLabel: { color: axisLabelColor }
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: axisLineColor } },
        axisLabel: { color: axisLabelColor },
        splitLine: { lineStyle: { color: splitLineColor } }
      },
      series: [
        {
          data: seriesData.map((item) => item.count),
          type: 'bar',
          itemStyle: {
            color: barGradient,
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
    <div className="relative h-[26rem] w-full md:h-[32rem]">
      <div ref={chartRef} className="h-full w-full" />
      {data.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {t('admin.noData')}
        </div>
      )}
    </div>
  );
};
