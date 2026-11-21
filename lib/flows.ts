"use client";

import { useEffect, useState } from "react";
import { scenario } from "@/lib/data";
import { recordTransfer, type DemoState } from "@/lib/demo";
import { makeRow, type FlowRow, type IotTransfer } from "@/lib/volume";
import { API_MODE, apiSend } from "@/lib/api/client";
import { invalidateResources, useResource } from "@/lib/api/resource";
import { flowFromApi, transferBody, type BeTransfer } from "@/lib/api/contract";

/** Transfer yang diukur sampai snapshot 14.42 sudah termasuk di level tangki snapshot. */
const SNAPSHOT = "14:42";

/** Transfer dari IoT Greenfields lewat GET /api/v1/transfers, diperbarui tiap 15 detik. Gagal ambil tidak mengganggu data manual. */
export function useIotTransfers(enabled = true) {
  const [items, setItems] = useState<IotTransfer[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const load = () => fetch("/api/v1/transfers", { cache: "no-store" }).then(r => (r.ok ? r.json() : { items: [] })).then(d => { if (live) setItems(d.items ?? []); }).catch(() => {});
    load();
    const id = setInterval(load, 15_000);
    return () => { live = false; clearInterval(id); };
  }, [enabled]);
  return items;
}

/** Semua transfer dalam satu bentuk: penerimaan RT ke tangki, transfer proses, dan data IoT. Terbaru dulu. */
export function buildFlows(s: Pick<DemoState, "receiving" | "operation">, iot: IotTransfer[]): FlowRow[] {
  const rtVolume = (rt: string) => s.receiving.records[rt]?.volume ?? scenario.tankers.find(t => t.id === rt)?.volume ?? s.receiving.arrivals.find(a => a.id === rt)?.volume;
  const rows = [
    ...s.receiving.transfers.map(t => makeRow({
      id: t.id, kind: "rt", from: t.rt, to: t.tank, out: t.out ?? rtVolume(t.rt) ?? t.volume, in: t.volume,
      start: t.start, end: t.end, measuredAt: t.measuredAt ?? t.end, source: "manual", by: t.by, note: t.note, counted: t.counted,
    })),
    ...s.operation.transfers.map(t => makeRow({
      id: t.id, kind: "proses", from: t.from, to: t.to, out: t.volume, in: t.received ?? t.volume,
      start: t.start, end: t.end, measuredAt: t.measuredAt ?? t.end, source: "manual", by: t.by, batch: t.batch, note: t.note, counted: (t.measuredAt ?? t.end) <= SNAPSHOT,
    })),
    ...iot.map(t => makeRow({
      id: t.id, kind: t.from.startsWith("RT-") ? "rt" : "proses", from: t.from, to: t.to, out: t.out, in: t.in,
      start: t.start, end: t.end, measuredAt: t.measuredAt, source: "iot", device: t.device, batch: t.batch, counted: t.measuredAt <= SNAPSHOT,
    })),
  ];
  return rows.sort((a, b) => b.measuredAt.localeCompare(a.measuredAt) || b.id.localeCompare(a.id));
}

/** Tanggal skenario, dipakai untuk recorded_at saat mencatat transfer ke server. */
export const SCENARIO_DATE = "2026-10-14";
const TRACE = "/trace/transfers";

/**
 * Semua transfer untuk halaman. Mode API: GET /trace/transfers (selisih dari server).
 * Mode lokal: catatan demo + ingest IoT dari route FE.
 */
export function useFlows(s: Pick<DemoState, "receiving" | "operation">) {
  const res = useResource<BeTransfer[]>(API_MODE ? TRACE : null);
  const iot = useIotTransfers(!API_MODE);
  const flows = API_MODE
    ? (res.data ?? []).map(t => flowFromApi(t, SNAPSHOT)).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt) || b.id.localeCompare(a.id))
    : buildFlows(s, iot);
  return { flows, iot, loading: API_MODE && res.loading && !res.data, error: API_MODE ? res.error : null };
}

/** Catat transfer: mode API lewat POST /trace/transfers (batch wajib), mode lokal ke state demo. */
export async function saveTransfer(t: { from: string; to: string; out: number; in: number; start: string; end: string; measuredAt: string; batch?: string; note?: string }, role: string) {
  if (!API_MODE) return recordTransfer(t);
  await apiSend("POST", TRACE, transferBody({ ...t, batch: t.batch ?? "" }, SCENARIO_DATE), role);
  invalidateResources([TRACE, "/audit"]);
}
