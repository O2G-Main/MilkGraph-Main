import type { BeExecDashboard, BePo, BeSchedule } from "./contract.ts";

/**
 * Kualitas jadwal produksi untuk radar: lima aspek dihitung dari respons server
 * (GET /schedules/latest, /pos, /dashboard/executive), tidak ada angka yang
 * ditulis tangan di FE. Aspek yang datanya belum ada bernilai null dan tampil
 * sebagai keadaan kosong, bukan 0 karangan.
 */
export interface RadarAxis {
  key: string;
  label: string;
  sub: string;
  formula: string;
  value: number | null;
  detail: string;
}

export interface ScheduleQuality {
  scheduleId: string;
  version: number;
  axes: RadarAxis[];
  average: number | null;
  poTotal: number;
  poRisk: number;
  weakest: RadarAxis | null;
  insight: string;
}

const ROOT_CAUSE_LABEL: Record<string, string> = {
  RAW_MATERIAL_SHORT: "kekurangan bahan baku",
};

const clamp = (n: number) => Math.min(100, Math.max(0, n));
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const fmt1 = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(n);
const fmt0 = (n: number) => new Intl.NumberFormat("id-ID").format(Math.round(n));

export function scheduleQuality(schedule: BeSchedule | null, pos: BePo[], exec: BeExecDashboard | null): ScheduleQuality | null {
  if (!schedule) return null;
  const ful = schedule.fulfilment ?? [];
  const runs = schedule.runs ?? [];
  const dueByPo = new Map(pos.map(p => [p.po_id, p.due_datetime]));

  const pemenuhan = ful.length ? clamp((mean(ful.map(f => f.fulfilled_pct)) ?? 0) * 100) : null;

  const comparable = ful.filter(f => dueByPo.has(f.po_id));
  const onTime = comparable.filter(f => Date.parse(f.planned_completion) <= Date.parse(dueByPo.get(f.po_id)!));
  const ketepatan = comparable.length ? (onTime.length / comparable.length) * 100 : null;

  const short = ful.filter(f => (f.root_causes ?? []).includes("RAW_MATERIAL_SHORT"));
  const kesiapan = ful.length ? ((ful.length - short.length) / ful.length) * 100 : null;

  const util = exec?.machine_utilization ?? [];
  const utilisasi = util.length ? clamp(mean(util.map(u => u.pct)) ?? 0) : null;
  const topUtil = util.length ? util.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;

  let durasiMenit = 0, changeoverMenit = 0;
  for (const r of runs) {
    const d = (Date.parse(r.end) - Date.parse(r.start)) / 60000;
    if (Number.isFinite(d) && d > 0) durasiMenit += d;
    changeoverMenit += r.changeover_after_min ?? 0;
  }
  const efisiensi = durasiMenit > 0 ? clamp(100 - (changeoverMenit / durasiMenit) * 100) : null;

  const axes: RadarAxis[] = [
    {
      key: "pemenuhan", label: "Pemenuhan PO", sub: "dari alokasi PO",
      formula: "Rata-rata persen terpenuhi per PO pada jadwal",
      value: pemenuhan,
      detail: ful.length ? `${ful.filter(f => f.fulfilled_pct >= 1).length} dari ${ful.length} PO terpenuhi 100%` : "Belum ada fulfilment pada jadwal ini",
    },
    {
      key: "ketepatan", label: "Ketepatan Selesai", sub: "rencana vs jatuh tempo",
      formula: "PO yang rencana selesainya tidak melewati jatuh tempo",
      value: ketepatan,
      detail: comparable.length ? `${onTime.length} dari ${comparable.length} PO selesai tepat waktu` : "Jatuh tempo PO belum bisa dibandingkan",
    },
    {
      key: "utilisasi", label: "Utilisasi Mesin", sub: "mesin filling",
      formula: "Rata-rata utilisasi mesin filling dari dashboard eksekutif",
      value: utilisasi,
      detail: topUtil ? `${util.length} mesin filling, tertinggi ${topUtil.fm_id} ${fmt1(topUtil.pct)}%` : "Utilisasi belum tersedia dari server",
    },
    {
      key: "kesiapan", label: "Kesiapan Bahan Baku", sub: "tanpa kekurangan bahan",
      formula: "PO tanpa akar masalah kekurangan bahan baku",
      value: kesiapan,
      detail: ful.length ? `${short.length} dari ${ful.length} PO tercatat kekurangan bahan baku` : "Belum ada fulfilment pada jadwal ini",
    },
    {
      key: "efisiensi", label: "Efisiensi Changeover", sub: "waktu ganti format",
      formula: "100 dikurangi porsi waktu ganti format dari total durasi run",
      value: efisiensi,
      detail: durasiMenit > 0 ? `Total ganti format ${fmt0(changeoverMenit)} menit dari ${fmt0(durasiMenit)} menit durasi run` : "Belum ada run pada jadwal ini",
    },
  ];

  const present = axes.filter(a => a.value !== null);
  const average = present.length ? mean(present.map(a => a.value!)) : null;
  const weakest = present.length ? present.reduce((a, b) => ((b.value ?? 0) < (a.value ?? 0) ? b : a)) : null;
  const poRisk = ful.filter(f => f.status === "AT_RISK" || f.status === "LATE").length;

  const causes = new Map<string, number>();
  for (const f of ful) for (const c of f.root_causes ?? []) causes.set(c, (causes.get(c) ?? 0) + 1);
  const topCause = [...causes.entries()].sort((a, b) => b[1] - a[1])[0];
  const sentences: string[] = [];
  if (ful.length && poRisk === 0) sentences.push(`Semua ${ful.length} PO sesuai rencana atau terpenuhi pada jadwal ini.`);
  if (poRisk > 0) {
    sentences.push(`${poRisk} dari ${ful.length} PO berstatus berisiko atau terlambat${topCause ? `, akar masalah terbanyak ${ROOT_CAUSE_LABEL[topCause[0]] ?? topCause[0]} pada ${topCause[1]} PO` : ""}.`);
  }
  if (weakest && weakest.value !== null) sentences.push(`Aspek terlemah adalah ${weakest.label.toLowerCase()} di ${fmt1(weakest.value)}%.`);

  return {
    scheduleId: schedule.schedule_id,
    version: schedule.version,
    axes,
    average,
    poTotal: ful.length,
    poRisk,
    weakest,
    insight: sentences.join(" "),
  };
}
