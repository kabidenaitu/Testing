import { queryGeneric } from 'convex/server';

const aspectOrder = [
  'punctuality',
  'crowding',
  'safety',
  'staff',
  'condition',
  'payment',
  'other'
] as const;

type AspectKey = (typeof aspectOrder)[number];

export const summary = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const complaints = await ctx.db.query('complaints').collect();

    const priorityDistribution: Record<'low' | 'medium' | 'high' | 'critical', number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    };

    const routeCounter = new Map<string, number>();
    const aspectCounter = new Map<string, number>();
    const heatmapCounter = new Map<string, number>();

    for (const complaint of complaints) {
      const priorityKey = complaint.priority as keyof typeof priorityDistribution;
      priorityDistribution[priorityKey] = (priorityDistribution[priorityKey] ?? 0) + 1;

      for (const tuple of complaint.tuples ?? []) {
        for (const obj of tuple.objects ?? []) {
          if (obj.type === 'route') {
            bumpCounter(routeCounter, normalizeKey(obj.value));
          }
        }

        for (const aspect of tuple.aspects ?? []) {
          const key = normalizeKey(aspect);
          if (key.length > 0) {
            bumpCounter(aspectCounter, key);
          }
        }
      }

      const submissionTime = complaint.submissionTime ?? complaint.createdAt;
      const bucket = buildHeatmapBucket(submissionTime);
      if (bucket) {
        bumpCounter(heatmapCounter, `${bucket.day}|${bucket.hour}`);
      }
    }

    const topRoutes = serializeTop(routeCounter, 10).map(([route, count]) => ({
      route,
      count
    }));

    const aspectFrequency = serializeTop(aspectCounter, aspectOrder.length).map(
      ([aspect, count]) => ({
        aspect,
        count
      })
    );

    const timeOfDayHeatmap = Array.from(heatmapCounter.entries())
      .map(([compound, count]) => {
        const [dayStr, hourStr] = compound.split('|');
        return {
          day: Number(dayStr),
          hour: Number(hourStr),
          count
        };
      })
      .sort((a, b) => (a.day === b.day ? a.hour - b.hour : a.day - b.day));

    return {
      topRoutes,
      priorityDistribution,
      aspectFrequency,
      timeOfDayHeatmap
    };
  }
});

function bumpCounter(map: Map<string, number>, key: string) {
  if (!key) {
    return;
  }

  map.set(key, (map.get(key) ?? 0) + 1);
}

function serializeTop(map: Map<string, number>, limit: number) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function normalizeKey(value: string) {
  return value.trim();
}

function buildHeatmapBucket(timestampIso?: string | null) {
  if (!timestampIso) {
    return null;
  }

  const parsed = new Date(timestampIso);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const jsDay = parsed.getUTCDay();
  const day = ((jsDay + 6) % 7) + 1; // Преобразуем к формату: 1 = понедельник, 7 = воскресенье.
  const hour = parsed.getUTCHours();

  return { day, hour };
}
