import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';

/**
 * useFetch('/path')  -> { data, loading, error, reload, refresh }
 * Pass null to skip fetching. `poll` (ms) refreshes quietly in the background (used for live queue screens).
 * The result always belongs to the CURRENT path: when the path changes, `loading` is true and `data` is null
 * until the new response arrives (so a component never renders data of the previous request).
 */
export function useFetch(path, { poll } = {}) {
  const [state, setState] = useState({ path: null, data: null, error: null, done: false });
  const alive = useRef(true);
  const current = useRef(path);
  current.current = path;

  const load = useCallback(async (silent) => {
    if (!path) return;
    if (!silent) setState((s) => ({ path, data: s.path === path ? s.data : null, error: null, done: false }));
    try {
      const data = await api.get(path);
      if (alive.current && current.current === path) setState({ path, data, error: null, done: true });
    } catch (error) {
      if (alive.current && current.current === path) setState((s) => ({ path, data: silent && s.path === path ? s.data : null, error, done: true }));
    }
  }, [path]);

  useEffect(() => { alive.current = true; load(false); return () => { alive.current = false; }; }, [load]);
  useEffect(() => {
    if (!poll || !path) return undefined;
    const id = setInterval(() => load(true), poll);
    return () => clearInterval(id);
  }, [poll, path, load]);

  const fresh = !!path && state.path === path;
  return {
    data: fresh ? state.data : null,
    error: fresh ? state.error : null,
    loading: !!path && !(fresh && state.done),
    reload: () => load(false), refresh: () => load(true),
  };
}

export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
