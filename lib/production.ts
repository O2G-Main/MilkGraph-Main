import type { Tone } from "../mock/types";

/** Jam "HH:MM" dalam shift; semua angka di sini data simulasi [asumsi]. */
export interface ScheduleItem { id: string; line: string; sku: string; packs: number; start: string; end: string }
export type CipGroup = "bay" | "rmt" | "uht" | "filler";
export interface ProductionRules { changeover: Record<string, number>; paper: number; cip: Record<CipGroup, number> }

export const SHIFT = { start: "14:00", end: "22:00" };

/** Standar CIP yang disepakati [asumsi]. Bay 70 menit sesuai CIP Bay 2 pukul 14.10-15.20. */
export const CIP_STANDARD: Record<CipGroup, { label: string; minutes: number; usedInPlan: boolean }> = {
  bay: { label: "Bay penerimaan", minutes: 70, usedInPlan: true },
  rmt: { label: "Raw milk tank", minutes: 60, usedInPlan: false },
  uht: { label: "Sterilizer UHT", minutes: 90, usedInPlan: false },
  filler: { label: "Mesin filling", minutes: 45, usedInPlan: false },
};
export const PAPER_STANDARD = 15;

export const toMinutes = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const clockOf = (t: string) => t.replace(":", ".");
export const changeoverKey = (from: string, to: string) => `${from}>${to}`;

export interface ItemCheck { capacity: number; minutes: number; issues: { tone: Tone; text: string }[] }

/** Cek tiap order: jam, bentrok di lini yang sama, jeda changeover dari order sebelumnya, dan kapasitas lini. */
export function checkSchedule(items: ScheduleItem[], rates: Record<string, number>, rules: Pick<ProductionRules, "changeover">): Record<string, ItemCheck> {
  const result: Record<string, ItemCheck> = {};
  for (const item of items) {
    const start = toMinutes(item.start), end = toMinutes(item.end);
    const minutes = Math.max(0, end - start);
    const capacity = Math.round((rates[item.line] ?? 0) * minutes);
    const issues: ItemCheck["issues"] = [];
    if (end <= start) issues.push({ tone: "crit", text: "Jam selesai harus setelah jam mulai." });
    const sameLine = items.filter(o => o.id !== item.id && o.line === item.line);
    const clash = sameLine.find(o => toMinutes(o.start) < end && toMinutes(o.end) > start);
    if (clash) issues.push({ tone: "crit", text: `Bentrok dengan ${clash.sku} pukul ${clockOf(clash.start)}-${clockOf(clash.end)}.` });
    const prev = sameLine.filter(o => toMinutes(o.end) <= start).sort((a, b) => toMinutes(b.end) - toMinutes(a.end))[0];
    if (prev && prev.sku !== item.sku) {
      const need = rules.changeover[changeoverKey(prev.sku, item.sku)];
      const gap = start - toMinutes(prev.end);
      if (need === undefined) issues.push({ tone: "neutral", text: `Standar changeover dari ${prev.sku} belum ada di Aturan Produksi.` });
      else if (gap < need) issues.push({ tone: "crit", text: `Jeda changeover dari ${prev.sku} cuma ${gap} menit, standarnya ${need} menit.` });
    }
    if (item.packs > capacity) issues.push({ tone: "warn", text: `Target melebihi kapasitas lini, maksimal ${new Intl.NumberFormat("id-ID").format(capacity)} pak di jam ini.` });
    result[item.id] = { capacity, minutes, issues };
  }
  return result;
}

/** Nilai aturan tidak boleh di bawah standar yang disepakati. */
export const belowStandard = (value: number, standard: number) => !Number.isFinite(value) || value < standard;
