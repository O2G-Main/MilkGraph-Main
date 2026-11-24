"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { ChevronRight, Radar } from "lucide-react";
import { API_MODE } from "@/lib/api/client";
import { useResource } from "@/lib/api/resource";
import type { BeExecDashboard, BePo, BeSchedule } from "@/lib/api/contract";
import { scheduleQuality, type RadarAxis, type ScheduleQuality } from "@/lib/api/radar-jadwal";
import { Card, Icon, SectionTitle } from "@/components/ui";

/**
 * Radar kualitas jadwal produksi. Kelima aspek dihitung dari jadwal aktif di
 * server (lib/api/radar-jadwal) setiap render data berubah; tidak ada nilai
 * yang ditulis tangan. Geometri radar memakai skala absolut 0-100 dan garis
 * lurus, supaya bentuknya tidak melebih-lebihkan selisih kecil.
 */

const PRIMARY = "#00782A";
const INK = "#0F2A1D";
const CRIT = "#B91C1C";
const pct = (n: number | null) => (n === null ? "Belum ada" : `${n.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`);

function useScheduleQuality() {
  const sch = useResource<BeSchedule>(API_MODE ? "/schedules/latest" : null);
  const pos = useResource<BePo[]>(API_MODE ? "/pos" : null);
  const exec = useResource<BeExecDashboard>(API_MODE ? "/dashboard/executive" : null);
  const quality = useMemo(
    () => (sch.data ? scheduleQuality(sch.data, pos.data ?? [], exec.data) : null),
    [sch.data, pos.data, exec.data],
  );
  const notFound = (sch.error as { status?: number } | null)?.status === 404;
  return { quality, loading: sch.loading && !sch.data, error: notFound ? null : sch.error, noSchedule: notFound || (!sch.loading && !sch.data && !sch.error) };
}

function State({ hook }: { hook: ReturnType<typeof useScheduleQuality> }) {
  if (hook.loading) return <p className="muted" role="status">Memuat kualitas jadwal…</p>;
  if (hook.error) return <p className="crit-text" role="alert">Gagal memuat jadwal aktif: {hook.error.message}</p>;
  if (hook.noSchedule || !hook.quality) return <p className="muted">Belum ada jadwal tergenerate di server. Buat jadwal dari halaman Penjadwalan untuk melihat radar kualitasnya.</p>;
  return null;
}

/* ---------- SVG radar: skala absolut, poligon lurus, ring target 100% ---------- */
function RadarSvg({ quality, onActive }: { quality: ScheduleQuality; active: string; onActive: (key: string) => void }) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const cx = 320, cy = 262, R = 172;
  const axes = quality.axes;
  const pt = (i: number, v: number) => {
    const ang = ((-90 + i * 72) * Math.PI) / 180;
    const r = (R * Math.min(100, Math.max(0, v))) / 100;
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)] as const;
  };
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).join(",")).join(" ");
  const weak = quality.weakest;
  return (
    <svg viewBox="0 0 640 560" width="100%" role="img" aria-label={`Radar kualitas jadwal ${quality.scheduleId}: ${axes.map(a => `${a.label} ${pct(a.value)}`).join(", ")}`} fontFamily="var(--font-onest), ui-sans-serif, system-ui, sans-serif">
      <defs>
        <linearGradient id={`rg${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22C55E" stopOpacity="0.15" />
          <stop offset="1" stopColor={PRIMARY} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {[100, 75, 50, 25].map((v, i) => (
        <polygon key={v} points={poly([v, v, v, v, v])} fill={i % 2 ? "var(--color-canvas)" : "var(--color-surface)"} stroke="var(--color-border)" strokeWidth="1" />
      ))}
      {axes.map((_, i) => { const [x, y] = pt(i, 100); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--color-border)" strokeWidth="1" />; })}
      <polygon points={poly([100, 100, 100, 100, 100])} fill="none" stroke="var(--color-on-surface-muted)" strokeOpacity="0.65" strokeWidth="1.4" strokeDasharray="5 4" />
      <text x={pt(0, 50)[0] + 6} y={pt(0, 50)[1] + 3} fontSize="9.5" fill="var(--color-on-surface-muted)" fontWeight="500">50%</text>
      <polygon points={poly(axes.map(a => a.value ?? 0))} fill={`url(#rg${gid})`} stroke={PRIMARY} strokeWidth="2.4" strokeLinejoin="round" />
      {axes.map((a, i) => {
        const v = a.value;
        const isWeak = weak?.key === a.key && v !== null && v < 50;
        const [vx, vy] = pt(i, v ?? 0);
        const [lx, ly] = pt(i, i === 3 ? 122 : i === 1 || i === 4 ? 120 : 115);
        const anchor = i === 1 ? "start" : i === 4 ? "end" : "middle";
        const words = a.label.split(" ");
        const lines = i === 1 || i === 4 ? words : words.length > 2 ? [words.slice(0, 2).join(" "), words.slice(2).join(" ")] : [a.label];
        const [hx, hy] = pt(i, v === null ? 50 : v);
        return (
          <g key={a.key}>
            {lines.map((ln, j) => (
              <text key={j} x={lx} y={ly + j * 13} textAnchor={anchor} fontSize="11.5" fontWeight="600" fill={INK} stroke="var(--color-surface)" strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">{ln}</text>
            ))}
            <text x={lx} y={ly + lines.length * 13 + 2} textAnchor={anchor} fontSize="9.5" fill="var(--color-on-surface-muted)" stroke="var(--color-surface)" strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">{a.sub}</text>
            {isWeak
              ? <><circle cx={vx} cy={vy} r="6.5" fill="none" stroke={CRIT} strokeWidth="1.5" /><circle cx={vx} cy={vy} r="4.2" fill={CRIT} stroke="#fff" strokeWidth="2" /></>
              : <circle cx={vx} cy={vy} r="4.4" fill={v === null ? "var(--color-on-surface-muted)" : PRIMARY} stroke="#fff" strokeWidth="2" />}
            <circle cx={hx} cy={hy} r="26" fill="transparent" tabIndex={0} role="button" aria-label={`${a.label}: ${pct(v)}. ${a.formula}.`}
              onMouseEnter={() => onActive(a.key)} onFocus={() => onActive(a.key)} style={{ cursor: "pointer", outline: "none" }} />
          </g>
        );
      })}
    </svg>
  );
}

function TipBox({ quality, axis }: { quality: ScheduleQuality; axis: RadarAxis }) {
  const hot = quality.weakest?.key === axis.key && axis.value !== null && axis.value < 50;
  return (
    <div className="radar-tip" role="status">
      <p className="radar-tip-title">{axis.label}{hot && <span className="radar-chip-hot">terlemah</span>}</p>
      <p className="radar-tip-row"><i style={{ background: hot ? "var(--color-status-crit)" : "var(--color-status-ok)" }} aria-hidden="true" />Jadwal {quality.scheduleId}<strong>{pct(axis.value)}</strong></p>
      <p className="radar-tip-detail">{axis.detail}</p>
    </div>
  );
}

function useActiveAxis(quality: ScheduleQuality | null) {
  const [picked, setPicked] = useState<string>("");
  const active = quality?.axes.find(a => a.key === picked) ?? quality?.weakest ?? quality?.axes[0] ?? null;
  return { active, setPicked };
}

/* ---------- Kartu penuh: halaman Transfer & Volume ---------- */
export function RadarJadwalCard() {
  const hook = useScheduleQuality();
  const { active, setPicked } = useActiveAxis(hook.quality);
  const q = hook.quality;
  return (
    <section className="radar-card" data-tour="transfer-radar" aria-label="Kualitas jadwal produksi">
      <div className="radar-head">
        <span className="radar-icon"><Icon icon={Radar} size={24} /></span>
        <div>
          <h2 className="radar-title">Kualitas Jadwal Produksi</h2>
          <p className="radar-sub">Lima aspek jadwal aktif dinilai dari data server: alokasi PO, ketepatan rencana selesai, utilisasi mesin, efisiensi ganti format, dan kesiapan bahan baku.</p>
        </div>
        <div className="radar-head-right">
          {q && (
            <div className="radar-legend">
              <span className="radar-lchip"><i className="radar-dot" style={{ background: PRIMARY }} />Jadwal {q.scheduleId}</span>
              <span className="radar-lchip"><i className="radar-dot radar-dot-dash" />Target 100%</span>
            </div>
          )}
        </div>
      </div>
      <State hook={hook} />
      {q && active && (
        <>
          <div className="radar-body">
            <div className="radar-chart-wrap">
              <RadarSvg quality={q} active={active.key} onActive={setPicked} />
              <TipBox quality={q} axis={active} />
            </div>
            <aside className="radar-rail">
              <div className="radar-avg">
                <div className="radar-avg-box"><span>Skor gabungan</span><strong>{q.average === null ? "Belum ada" : <>{q.average.toLocaleString("id-ID", { maximumFractionDigits: 1 })}<small> / 100</small></>}</strong></div>
                <div className="radar-avg-box"><span>PO berisiko</span><strong className={q.poRisk ? "radar-crit" : undefined}>{q.poRisk}<small> dari {q.poTotal} PO</small></strong></div>
              </div>
              <h3 className="radar-rail-title">Per aspek</h3>
              {q.axes.map(a => {
                const hot = q.weakest?.key === a.key && a.value !== null && a.value < 50;
                return (
                  <button type="button" key={a.key} className={`radar-srow${hot ? " hot" : ""}${active.key === a.key ? " on" : ""}`} onMouseEnter={() => setPicked(a.key)} onFocus={() => setPicked(a.key)} onClick={() => setPicked(a.key)}>
                    <span className="radar-srow-head"><span>{a.label}</span>{hot && <span className="radar-chip-hot">terlemah</span>}</span>
                    <span className="radar-sformula">{a.formula}</span>
                    <span className="radar-sbar"><span className="radar-strack"><i style={{ width: `${a.value ?? 0}%`, background: hot ? CRIT : PRIMARY }} /></span><span className="radar-sval">{pct(a.value)}</span></span>
                  </button>
                );
              })}
              {q.insight && <div className="radar-insight"><p className="radar-insight-title">Pembacaan cepat</p><p>{q.insight}</p></div>}
            </aside>
          </div>
          <p className="radar-foot">Dihitung dari GET /schedules/latest, /pos, dan /dashboard/executive untuk jadwal {q.scheduleId} versi {q.version}. Di aplikasi, kelima aspek dihitung ulang otomatis setiap ada jadwal baru, tanpa angka yang ditulis tangan. Arahkan kursor ke satu sumbu atau baris aspek untuk melihat rinciannya.</p>
        </>
      )}
    </section>
  );
}

/* ---------- Kartu grafik untuk Beranda (baris radar) ---------- */
export function RadarJadwalChartCard() {
  const hook = useScheduleQuality();
  const { active, setPicked } = useActiveAxis(hook.quality);
  const q = hook.quality;
  return (
    <Card className="exec-card radar-strong">
      <SectionTitle title="Kualitas Jadwal Produksi" subtitle={q ? `Radar lima aspek jadwal ${q.scheduleId}.` : "Radar lima aspek jadwal aktif dari server."} action={<Link className="text-link" href="/penjadwalan">Detail<Icon icon={ChevronRight} size={14} /></Link>} />
      <State hook={hook} />
      {q && active && (
        <>
          <RadarSvg quality={q} active={active.key} onActive={setPicked} />
          <TipBox quality={q} axis={active} />
        </>
      )}
    </Card>
  );
}

/* ---------- Kartu tabel untuk Beranda (pendamping radar) ---------- */
export function RadarJadwalTableCard() {
  const hook = useScheduleQuality();
  const q = hook.quality;
  return (
    <Card className="exec-card radar-strong">
      <SectionTitle title="Nilai Kualitas Jadwal" subtitle={q ? `Nilai per aspek untuk jadwal ${q.scheduleId} versi ${q.version}.` : "Nilai per aspek jadwal aktif."} action={<Link className="text-link" href="/transfer">Detail<Icon icon={ChevronRight} size={14} /></Link>} />
      <State hook={hook} />
      {q && (
        <>
          <div className="table-wrap"><table className="schedule-table">
            <thead><tr><th>Aspek</th><th className="numeric">Nilai</th></tr></thead>
            <tbody>
              {q.axes.map(a => {
                const hot = q.weakest?.key === a.key && a.value !== null && a.value < 50;
                return (
                  <tr key={a.key}>
                    <td><strong>{a.label}</strong>{hot && <span className="radar-chip-hot">terlemah</span>}<span className="table-sub">{a.formula}</span></td>
                    <td data-label="Nilai" className={`numeric ${hot ? "crit-text" : ""}`}><strong>{pct(a.value)}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          <p className="small muted">Skor gabungan {q.average === null ? "belum tersedia" : `${q.average.toLocaleString("id-ID", { maximumFractionDigits: 1 })} dari 100`}. {q.poRisk} dari {q.poTotal} PO berstatus berisiko atau terlambat. Nilai dihitung ulang otomatis setiap ada jadwal baru.</p>
        </>
      )}
    </Card>
  );
}
