import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);
const KEY = 'govbook-theme';

const initial = () => {
  try { const t = localStorage.getItem(KEY); if (t === 'light' || t === 'dark') return t; } catch { /* ignore */ }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(initial);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  const setTheme = useCallback((t) => {
    const root = document.documentElement;
    root.classList.add('theme-anim');                       // smooth cross-fade for ~0.4s
    setThemeState(t);
    try { localStorage.setItem(KEY, t); } catch { /* ignore */ }  // remembered for the next visit
    window.setTimeout(() => root.classList.remove('theme-anim'), 450);
  }, []);
  const toggle = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme, setTheme]);

  const value = useMemo(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
