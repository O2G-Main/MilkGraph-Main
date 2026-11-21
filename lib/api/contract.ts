/**
 * Adapter Kontrak API Backend Tahap 3 (21 Nov 2026): Jadwal Kedatangan RT, Transfer & Volume, dan Chat AI.
 * Nilai turunan (late_minutes, selisih_l) selalu dari server; FE hanya menampilkan.
 */
import type { Arrival, ArrivalStatus } from "../receiving.ts";
import type { FlowRow } from "../volume.ts";

/* ---------- Jadwal Kedatangan RT: /api/v1/supply/rt-arrivals ---------- */
export type BeArrivalStatus = "Dijadwalkan" | "Dalam Perjalanan" | "Sudah Tiba" | "Dibatalkan";
export interface BeArrival {
  id: string; farm_id: string; farm_name: string; rt_id: string; volume_l: number;
  depart_at: string; target_arrival: string; estimated_arrival: string; actual_arrival: string | null;
  status: BeArrivalStatus; late_minutes: number;
}
export const STATUS_FROM_API: Record<BeArrivalStatus, ArrivalStatus> = { Dijadwalkan: "loading", "Dalam Perjalanan": "perjalanan", "Sudah Tiba": "tiba", Dibatalkan: "batal" };
export const STATUS_TO_API: Record<ArrivalStatus, BeArrivalStatus> = { loading: "Dijadwalkan", perjalanan: "Dalam Perjalanan", tiba: "Sudah Tiba", batal: "Dibatalkan" };

/** Jam dari server bisa "HH:MM", "HH:MM:SS", atau ISO datetime; FE menampilkan "HH:MM" waktu WIB. */
export function toHHMM(v: string | null | undefined): string {
  if (!v) return "";
  const plain = v.match(/^(\d{2}):(\d{2})/);
  if (plain) return `${plain[1]}:${plain[2]}`;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" });
}

/** Satu baris jadwal kedatangan di FE. `apiId` dipakai untuk PUT; `late` dari late_minutes server. */
export type ArrivalRow = Arrival & { apiId?: string; farmId?: string; target: string; actual?: string; late: number };
export const arrivalFromApi = (b: BeArrival): ArrivalRow => ({
  id: b.rt_id, apiId: b.id, farm: b.farm_name, farmId: b.farm_id, volume: b.volume_l,
  depart: toHHMM(b.depart_at), target: toHHMM(b.target_arrival), eta: toHHMM(b.estimated_arrival), actual: toHHMM(b.actual_arrival) || undefined,
  status: STATUS_FROM_API[b.status] ?? "loading", late: b.late_minutes, milkStart: "", note: "",
});
/** Body POST: field record tanpa id dan late_minutes (dihitung server). */
export const arrivalCreateBody = (a: ArrivalRow) => ({
  farm_id: a.farmId ?? "", farm_name: a.farm, rt_id: a.id, volume_l: a.volume,
  depart_at: a.depart, target_arrival: a.target, estimated_arrival: a.eta, actual_arrival: a.actual ?? null, status: STATUS_TO_API[a.status],
});
/** Body PUT parsial. actual_arrival "" mengosongkan jadi null di server. */
export const arrivalUpdateBody = (a: Pick<ArrivalRow, "eta" | "status" | "actual">) => ({
  estimated_arrival: a.eta, status: STATUS_TO_API[a.status], actual_arrival: a.status === "tiba" ? a.actual ?? "" : "",
});

/* ---------- Transfer & Volume: /api/v1/trace/transfers ---------- */
export interface BeTransfer {
  id: string; batch_id: string; from_ref: string; to_ref: string; volume_out_l: number; volume_in_l: number;
  selisih_l: number; source: "Manual" | "IoT"; recorded_at: string;
}
/** Transfer dari server ke baris FE. Selisih dari selisih_l server; persen hanya untuk tampilan. */
export function flowFromApi(t: BeTransfer, snapshot = "14:42"): FlowRow {
  const at = toHHMM(t.recorded_at);
  return {
    id: t.id, kind: t.from_ref.startsWith("RT-") ? "rt" : "proses", from: t.from_ref, to: t.to_ref,
    out: t.volume_out_l, in: t.volume_in_l, diff: t.selisih_l, diffPct: t.volume_out_l ? (t.selisih_l / t.volume_out_l) * 100 : 0,
    start: at, end: at, measuredAt: at, source: t.source === "IoT" ? "iot" : "manual", batch: t.batch_id || undefined,
    counted: !!at && at <= snapshot,
  };
}
/** Body POST transfer. recorded_at dikirim sebagai ISO WIB dari jam pengukuran. */
export const transferBody = (t: { batch: string; from: string; to: string; out: number; in: number; measuredAt: string }, date: string) => ({
  batch_id: t.batch, from_ref: t.from, to_ref: t.to, volume_out_l: t.out, volume_in_l: t.in, source: "Manual" as const,
  recorded_at: `${date}T${t.measuredAt}:00+07:00`,
});

/* ---------- Chat AI: /api/v1/assistant/chat ---------- */
export interface ChatReply { jawaban: string; sumber?: unknown; label_data?: string }
/** Sumber jawaban bisa string, array string, atau array objek berlabel; diringkas jadi teks. */
export function sourceText(sumber: unknown): string {
  if (!sumber) return "";
  if (typeof sumber === "string") return sumber;
  if (Array.isArray(sumber)) return sumber.map(s => (typeof s === "string" ? s : s && typeof s === "object" ? String((s as Record<string, unknown>).label ?? (s as Record<string, unknown>).id ?? (s as Record<string, unknown>).nama ?? "") : "")).filter(Boolean).join(", ");
  if (typeof sumber === "object") return String((sumber as Record<string, unknown>).label ?? "");
  return "";
}
/** Pesan wajar untuk keadaan layanan AI; jawaban tetap diberikan dari data aplikasi. */
export function chatNotice(status: number | undefined): string {
  if (status === 503) return "Asisten AI belum diaktifkan di server, jadi jawaban ini disusun dari data aplikasi.";
  if (status === 502) return "Layanan AI sedang tidak terjangkau, jadi jawaban ini disusun dari data aplikasi.";
  return "Asisten AI belum bisa dihubungi, jadi jawaban ini disusun dari data aplikasi.";
}
/** 401 dan 403 adalah masalah akses peran, bukan layanan AI mati; jangan ditutupi jawaban lokal. */
export const isAccessError = (status: number | undefined) => status === 401 || status === 403;

/* ---------- Penjadwalan: /api/v1/pos dan /api/v1/schedules ---------- */
export interface BePoLine { sku: string; qty_liter: number }
export interface BePo { po_id: string; priority: number; lines: BePoLine[]; due_datetime: string; label_data: string }
export interface BeRun {
  run_id: string; po_id: string; sku: string; fm_id: string; tank_source: string;
  start: string; end: string; qty_liter: number; changeover_after_min?: number;
}
export interface BeFulfilment { po_id: string; status: string; fulfilled_pct: number; planned_completion: string; root_causes: string[] }
export interface BeScheduleWarning { type: string; resource_id: string; needed_l?: number; available_l?: number; limit_h?: number; projected_h?: number }
export interface BeSchedule {
  schedule_id: string; version: number; generated_at: string; triggered_by: string;
  window: { start: string; end: string }; runs: BeRun[]; fulfilment: BeFulfilment[]; warnings: BeScheduleWarning[];
}
/** Balasan POST /api/v1/schedules/narrate: respons service AI apa adanya. */
export interface BeScheduleNarrate { batch_id: string; penjelasan: string; sumber?: unknown; label_data?: string; jev?: unknown }

export const FULFILMENT_LABEL: Record<string, string> = { ON_TRACK: "Sesuai rencana", AT_RISK: "Berisiko", LATE: "Terlambat", FULFILLED: "Terpenuhi" };
export const FULFILMENT_TONE: Record<string, "ok" | "warn" | "crit" | "neutral"> = { ON_TRACK: "ok", AT_RISK: "warn", LATE: "crit", FULFILLED: "ok" };
/** Kode pemicu regenerasi jadwal yang diterima POST /api/v1/schedules/triggers. */
export const TRIGGER_REASONS: { code: string; label: string }[] = [
  { code: "RT_LATE", label: "RT terlambat" },
  { code: "RT_QUEUE", label: "Antrean RT" },
  { code: "DOWNTIME", label: "Downtime alat" },
  { code: "RAW_MATERIAL_SHORT", label: "Bahan baku kurang" },
  { code: "HOLDING_EXCEEDED", label: "Holding time terlampaui" },
  { code: "PO_CHANGED", label: "PO berubah" },
];
/** Stempel waktu server (RFC3339) ditampilkan sebagai tanggal dan jam WIB. */
export function fmtWaktu(v: string | null | undefined): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" });
}
/** fulfilled_pct dari server berupa pecahan 0 sampai 1. */
export const pctText = (p: number) => `${Math.round((p ?? 0) * 100)}%`;

/* ---------- Dashboard Eksekutif: /api/v1/dashboard/executive ---------- */
export interface BeExecDashboard {
  milk_received_l: { total: number; by_farm: { farm_id: string; farm_name: string; total_l: number }[] };
  machine_utilization: { fm_id: string; used_hours: number; downtime_hours: number; pct: number }[];
  daily_schedule: { schedule_id: string; version: number; window: { start: string; end: string }; runs_count: number; targets: { date: string; due_liter: number; scheduled_liter: number }[] } | null;
  po_summary: { fulfilled: number; at_risk: number; late: number; on_track: number; fulfilment: BeFulfilment[] } | null;
}

/* ---------- Import CSV: /api/v1/pos/import dan /api/v1/supply/rt-arrivals/import ---------- */
/** Laporan import dua tahap: commit=false pratinjau (tidak menyimpan), commit=true menyimpan baris valid. */
export interface BeImportError { baris: number; pesan: string }
export interface BeImportReport<Row> {
  commit: boolean; total_baris: number; valid: number; gagal: number; dibuat: number;
  errors: BeImportError[]; rows: Row[];
}
/** Ringkasan satu PO hasil grouping baris CSV pada laporan import PO. */
export interface BeImportPoRow { po_id: string; priority: number; due_datetime: string; jumlah_baris: number; total_liter: number; label_data: string }
export const PO_IMPORT_TEMPLATE =
  "po_id,priority,due_datetime,sku_id,qty_liter\n" +
  "PO-2026-1102,1,2026-11-24T08:00:00+07:00,UHT-CH-250-LOCAL,12000\n" +
  "PO-2026-1102,1,2026-11-24T08:00:00+07:00,UHT-CH-1000-LOCAL,8000\n";
export const RT_IMPORT_TEMPLATE =
  "rt_id,farm_name,volume_l,depart_at,target_arrival,estimated_arrival,actual_arrival,status\n" +
  "RT-41,Farm Tutur,9000,05:30,07:00,07:10,,Dalam Perjalanan\n" +
  "RT-42,KUD Ngantang,11000,06:00,08:00,07:50,07:50,Sudah Tiba\n";

/* ---------- Role & Hak Akses: /api/v1/roles dan /api/v1/permissions ---------- */
/** Satu role dari registri BE. Persona (user, initials, focus) ikut dari server, bukan dari registri lokal. */
export interface BeRole { label: string; user: string; initials: string; focus: string; builtin: boolean; permissions: string[] }
export interface BeRolesResponse { roles: Record<string, BeRole>; permissions: Record<string, { label: string; roles: string[] }> }
export interface BePermission { name: string; label: string }
