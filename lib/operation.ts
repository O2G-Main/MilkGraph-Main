import type { Tone } from "../mock/types";

/** Jam "HH:MM"; data simulasi. */
export const NOW = "14:42";
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

/** Realisasi satu order jadwal produksi di lini. */
export interface Run { start?: string; end?: string; output?: number; reject?: number; by?: string }
export type RunState = "belum" | "jalan" | "selesai";
export const runState = (r: Run | undefined): RunState => (r?.end ? "selesai" : r?.start ? "jalan" : "belum");
/** Order yang jam mulainya sudah lewat tapi belum dicatat mulai. */
export const isLate = (planStart: string, r: Run | undefined, now = NOW) => runState(r) === "belum" && toMin(planStart) <= toMin(now);
/** Pencapaian hasil baik terhadap target, dalam persen bulat. */
export const attainment = (output: number, target: number) => (target > 0 ? Math.round((output / target) * 100) : 0);

/** Kondisi mesin yang bisa dipilih operator. */
export const MACHINE_STATE = {
  jalan: { label: "Jalan", tone: "ok" },
  siaga: { label: "Siaga", tone: "neutral" },
  cip: { label: "CIP", tone: "warn" },
  "ganti-format": { label: "Ganti format", tone: "warn" },
  maintenance: { label: "Maintenance", tone: "warn" },
  breakdown: { label: "Breakdown", tone: "crit" },
} satisfies Record<string, { label: string; tone: Tone }>;
export type MachineState = keyof typeof MACHINE_STATE;
export interface MachineUpdate { state: MachineState; note: string; at: string; by: string }

export const DOWNTIME_CAUSE = ["Breakdown", "CIP", "Ganti format", "Tunggu bahan", "Maintenance", "Lainnya"] as const;
export interface Downtime { id: string; asset: string; cause: (typeof DOWNTIME_CAUSE)[number]; start: string; end?: string; note: string }
/** Lama downtime; yang masih terbuka dihitung sampai `now`. */
export const downtimeMinutes = (d: Downtime, now = NOW) => Math.max(0, toMin(d.end ?? now) - toMin(d.start));

/** Perpindahan bahan antar-alat proses (mis. UHT-2 ke AT-2). `volume`: keluar dari alat asal; `received`: diterima alat tujuan (sama dengan volume bila belum diukur). */
export interface ProcessTransfer { id: string; from: string; to: string; volume: number; start: string; end: string; by: string; received?: number; measuredAt?: string; batch?: string; note?: string }
export function checkProcessTransfer(t: Pick<ProcessTransfer, "from" | "to" | "volume" | "start" | "end">) {
  if (t.from === t.to) return "Alat asal dan tujuan harus berbeda.";
  if (!(t.volume > 0)) return "Isi volume lebih dari 0 L.";
  if (toMin(t.end) <= toMin(t.start)) return "Jam selesai harus setelah jam mulai.";
  return null;
}

export interface OperationState { runs: Record<string, Run>; machines: Record<string, MachineUpdate>; downtime: Downtime[]; transfers: ProcessTransfer[] }

/** Alat yang boleh diubah: semua untuk peran tanpa penugasan (Superadmin), atau yang ditugaskan. */
export const mayHandle = (assigned: string[] | undefined, asset: string) => !assigned || assigned.includes(asset);
