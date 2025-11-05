const FALLBACK_COLORS: Record<string, string> = {
  '--foreground': '#0f172a',
  '--muted-foreground': '#64748b',
  '--priority-low': '#22c55e',
  '--priority-medium': '#f59e0b',
  '--priority-high': '#ef4444',
  '--priority-critical': '#dc2626',
  '--accent': '#6366f1',
  '--primary': '#2563eb'
};

const getComputedVar = (variable: string): string | null => {
  if (typeof window === 'undefined' || !variable.startsWith('--')) {
    return null;
  }

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();

  if (value.length === 0) {
    return FALLBACK_COLORS[variable] ?? null;
  }

  // Значения custom properties записаны в виде "H S L" без обёртки hsl(), поэтому возвращаем как есть.
  return value;
};

export const getCssHslColor = (variable: string, alpha?: number): string => {
  const raw = getComputedVar(variable);

  if (!raw) {
    return FALLBACK_COLORS[variable] ?? '#000000';
  }

  if (raw.startsWith('#') || raw.startsWith('rgb') || raw.startsWith('hsl(')) {
    return raw;
  }

  if (typeof alpha === 'number') {
    return `hsl(${raw} / ${alpha})`;
  }

  return `hsl(${raw})`;
};
