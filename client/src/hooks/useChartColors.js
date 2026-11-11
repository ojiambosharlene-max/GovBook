import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';

/** Reads the chart colours from the active theme's CSS variables so charts follow dark / light mode. */
export function useChartColors() {
  const { theme } = useTheme();
  const read = () => {
    const s = getComputedStyle(document.documentElement); const v = (n) => s.getPropertyValue(n).trim();
    return { c1: v('--chart-1'), c2: v('--chart-2'), c3: v('--chart-3'), c4: v('--chart-4'), c5: v('--chart-5'), grid: v('--chart-grid'), text: v('--chart-text'), surface: v('--surface'), border: v('--border') };
  };
  const [colors, setColors] = useState(read);
  useEffect(() => { const t = setTimeout(() => setColors(read()), 30); return () => clearTimeout(t); }, [theme]); // eslint-disable-line react-hooks/exhaustive-deps
  return colors;
}
