"use client";

import { useSyncExternalStore } from "react";

/**
 * Status baca notifikasi per akun, disimpan di browser.
 * Dipisah dari lib/demo.ts karena ini preferensi tampilan, bukan data operasional.
 */
const KEY = (account: string) => `milkgraph-notif-read:${account}`;
const EMPTY: string[] = [];
const cache = new Map<string, string[]>();
const listeners = new Set<() => void>();

function read(account: string): string[] {
  const hit = cache.get(account);
  if (hit) return hit;
  let ids: string[] = EMPTY;
  try {
    const raw = localStorage.getItem(KEY(account));
    if (raw) ids = JSON.parse(raw) as string[];
  } catch { ids = EMPTY; }
  cache.set(account, ids);
  return ids;
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function useNotifRead(account: string) {
  const readIds = useSyncExternalStore(subscribe, () => read(account), () => EMPTY);
  const mark = (ids: string[]) => {
    const next = [...new Set([...read(account), ...ids])];
    cache.set(account, next);
    try { localStorage.setItem(KEY(account), JSON.stringify(next)); } catch { /* mode privat */ }
    listeners.forEach(fn => fn());
  };
  return { readIds, mark };
}
