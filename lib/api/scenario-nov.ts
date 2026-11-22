"use client";

import { API_MODE } from "./client.ts";
import { useResource } from "./resource.ts";
import type { TankRef } from "@/components/transfer/tank-volume-api";

/** Bentuk tangki pada snapshot skenario November di Backend. */
interface BeTankNov {
  id: string;
  volume_l: number;
  kapasitas_l: number;
}

interface BeScenarioNovTanks {
  label_data: string;
  snapshot_time: string;
  jangkar: string;
  tanks: BeTankNov[];
}

/**
 * Snapshot stok tangki skenario November (GET /scenario/november/tanks):
 * 28 tangki historis per 1 Nov 2026 06.00 WIB. Kartu volume tangki mode
 * API membaca level dan kapasitas dari sini, bukan lagi dari skenario
 * simulasi lokal. Di luar mode API hook ini diam.
 */
export function useNovemberTanks(): { tanks: TankRef[] | null; loading: boolean; error: Error | null } {
  const res = useResource<BeScenarioNovTanks>(API_MODE ? "/scenario/november/tanks" : null);
  const tanks = res.data ? res.data.tanks.map(t => ({ id: t.id, level: t.volume_l, capacity: t.kapasitas_l })) : null;
  return { tanks, loading: res.loading, error: res.error };
}
