"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Form state kept as strings, optionally mirrored to the URL query (shareable results).
 * Reads the query once after mount; writes with history.replaceState on change.
 */
export function useUrlState<T extends Record<string, string>>(defaults: T, sync: boolean): [T, (patch: Partial<T>) => void] {
  const [state, setState] = useState<T>(defaults);
  const ref = useRef<T>(defaults);
  const defaultsRef = useRef<T>(defaults);

  useEffect(() => {
    if (!sync) return;
    const params = new URLSearchParams(window.location.search);
    const next: Record<string, string> = { ...defaultsRef.current };
    let changed = false;
    for (const k of Object.keys(next)) {
      const v = params.get(k);
      if (v !== null && v.length <= 200) {
        next[k] = v;
        changed = true;
      }
    }
    if (changed) {
      ref.current = next as T;
      const t = setTimeout(() => setState(next as T), 0);
      return () => clearTimeout(t);
    }
  }, [sync]);

  const update = useCallback(
    (patch: Partial<T>) => {
      const next = { ...ref.current, ...patch } as T;
      ref.current = next;
      setState(next);
      if (sync) {
        try {
          const params = new URLSearchParams();
          for (const k of Object.keys(next)) if (next[k] !== defaultsRef.current[k]) params.set(k, next[k]);
          const qs = params.toString();
          window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
        } catch {
          /* ignore */
        }
      }
    },
    [sync],
  );

  return [state, update];
}
