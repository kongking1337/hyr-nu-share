import { useCallback, useEffect, useState } from "react";
import type { UnifiedResult } from "@/lib/providers/types";

const KEY = "hyrkoll-compare";

function read(): UnifiedResult[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as UnifiedResult[];
  } catch {
    return [];
  }
}

export function useCompare() {
  const [items, setItems] = useState<UnifiedResult[]>([]);

  useEffect(() => {
    setItems(read());
    const onChange = () => setItems(read());
    window.addEventListener("hyrkoll-compare-change", onChange);
    return () => window.removeEventListener("hyrkoll-compare-change", onChange);
  }, []);

  const persist = useCallback((next: UnifiedResult[]) => {
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("hyrkoll-compare-change"));
  }, []);

  const toggle = useCallback(
    (item: UnifiedResult) => {
      const current = read();
      const exists = current.some((i) => i.id === item.id);
      const next = exists
        ? current.filter((i) => i.id !== item.id)
        : [...current, item].slice(-4);
      persist(next);
    },
    [persist],
  );

  const clear = useCallback(() => persist([]), [persist]);

  return { items, toggle, clear, has: (id: string) => items.some((i) => i.id === id) };
}
