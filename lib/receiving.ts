import type { Tanker, Tone } from "../mock/types";

/** Jam "HH:MM". Snapshot skenario pukul 14.42; semua angka data simulasi. */
export const SNAPSHOT = "14:42";

export type ArrivalStatus = "loading" | "perjalanan" | "tiba" | "batal";
export const ARRIVAL_STATUS: Record<ArrivalStatus, { label: string; tone: Tone }> = {
  loading: { label: "Dijadwalkan", tone: "neutral" },
  perjalanan: { label: "Dalam Perjalanan", tone: "ok" },
  tiba: { label: "Sudah Tiba", tone: "ok" },
  batal: { label: "Dibatalkan", tone: "crit" },
};
/** milkStart: waktu awal umur susu (pemerahan pertama yang masuk RT). */
/** `target`: jam tiba yang dijadwalkan; `eta`: estimasi tiba terbaru; keterlambatan = eta - target. */
export interface Arrival { id: string; farm: string; volume: number; depart: string; eta: string; milkStart: string; status: ArrivalStatus; note: string; target?: string; actual?: string }
/** Catatan lapangan per RT: kedatangan aktual, awal umur susu, dan proses bongkar. */
export interface RtRecord { arrivedAt?: string; milkStart?: string; bay?: string; unloadStart?: string; unloadEnd?: string; volume?: number; temperature?: number }
/** `volume`: diterima tangki; `out`: keluar dari RT (timbangan). */
export interface Transfer { id: string; rt: string; tank: string; volume: number; start: string; end: string; counted: boolean; out?: number; measuredAt?: string; note?: string; by?: string }
export interface ReceivingState { arrivals: Arrival[]; records: Record<string, RtRecord>; transfers: Transfer[] }

export const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const clock = (t: string) => t.replace(":", ".");
const pad = (n: number) => String(n).padStart(2, "0");
export const fromMin = (m: number) => { const v = ((m % 1440) + 1440) % 1440; return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`; };
export const later = (a: string, b: string) => (toMin(a) >= toMin(b) ? a : b);
/** Umur susu di jam `at`. Awal umur yang lebih besar dari `at` dianggap kemarin. */
export const ageAt = (milkStart: string, at: string) => { const d = toMin(at) - toMin(milkStart); return d < 0 ? d + 1440 : d; };
export const ageText = (min: number) => `${Math.floor(min / 60)}j ${pad(min % 60)}m`;
const parseAge = (age: string) => { const m = age.match(/(\d+)j\s*(\d+)m/); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; };
/** Nada umur susu terhadap batas holding: kritis bila sisa kurang dari 90 menit, waspada bila kurang dari 3 jam. */
export const ageTone = (age: number, holdingMin: number): Tone => holdingMin - age < 90 ? "crit" : holdingMin - age < 180 ? "warn" : "ok";

/** Antrean gabungan: RT dari skenario ditambah RT yang dicatat tiba, tahap mengikuti catatan bongkar. */
export function applyQueue(tankers: Tanker[], state: ReceivingState, holdingMin: number) {
  const fromScenario = tankers.map(t => ({ ...t, milkStart: fromMin(toMin(SNAPSHOT) - parseAge(t.age)), arrivedAt: undefined as string | undefined, fresh: false }));
  const arrived = state.arrivals.filter(a => a.status === "tiba").map(a => ({
    id: a.id, farm: a.farm, volume: a.volume, stage: "Sampling", wait: 0, age: "", temperature: 4, tone: "ok" as Tone, source: "",
    milkStart: a.milkStart, arrivedAt: undefined as string | undefined, fresh: true,
  }));
  return [...fromScenario, ...arrived].map(t => {
    const r = state.records[t.id] ?? {};
    const milkStart = r.milkStart ?? t.milkStart;
    const at = [SNAPSHOT, r.arrivedAt, r.unloadStart, r.unloadEnd].filter((x): x is string => !!x).reduce(later);
    // Umur berhenti bertambah saat susu sudah masuk tangki.
    const age = ageAt(milkStart, r.unloadEnd ?? at);
    const stage = r.unloadEnd ? "Selesai bongkar" : r.unloadStart ? "Unloading" : t.stage;
    return { ...t, ...r.volume ? { volume: r.volume } : {}, ...r.temperature ? { temperature: r.temperature } : {}, milkStart, arrivedAt: r.arrivedAt ?? t.arrivedAt, bay: r.bay, unloadStart: r.unloadStart, unloadEnd: r.unloadEnd, stage, ageMin: age, age: ageText(age), tone: r.unloadEnd ? "ok" as Tone : ageTone(age, holdingMin) };
  });
}
export type QueueRow = ReturnType<typeof applyQueue>[number];

/** Perkiraan umur susu saat RT tiba di plant, untuk menandai kedatangan yang berisiko. */
export const arrivalAge = (a: Arrival) => ageAt(a.milkStart, a.eta);

export interface Tank { id: string; fill: number; capacity: number }
/** Sisa ruang tiap tangki setelah transfer baru (transfer lama sudah termasuk di level snapshot). */
export function tankRoom(tanks: Tank[], transfers: Transfer[]) {
  return Object.fromEntries(tanks.map(t => {
    const added = transfers.filter(x => x.tank === t.id && !x.counted).reduce((s, x) => s + x.volume, 0);
    return [t.id, { fill: t.fill + added, capacity: t.capacity, free: t.capacity - t.fill - added }];
  }));
}

/** Cek satu transfer: volume masuk tangki dan selisih dengan volume timbang RT. */
export function checkTransfer(volume: number, rtVolume: number | undefined, free: number) {
  const issues: { tone: Tone; text: string }[] = [];
  if (!(volume > 0)) issues.push({ tone: "crit", text: "Isi volume transfer lebih dari 0 L." });
  if (volume > free) issues.push({ tone: "crit", text: `Melebihi sisa ruang tangki ${new Intl.NumberFormat("id-ID").format(Math.max(0, free))} L.` });
  if (rtVolume && volume > 0 && Math.abs(volume - rtVolume) / rtVolume > 0.005) issues.push({ tone: "warn", text: `Selisih ${new Intl.NumberFormat("id-ID").format(volume - rtVolume)} L dengan volume timbang RT.` });
  return issues;
}
