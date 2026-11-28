"use client";

import Link from "next/link";
import { CircleMinus, FlaskConical, Plus, TrendingUp, X } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, Icon, Toggle } from "@/components/ui";
import { Equipment } from "@/components/trace/equipment";
import { ASSETS } from "@/lib/assets";
import { useDemo } from "@/lib/demo";
import { asepticTanks, fillers } from "@/mock/ops";
import type { Plan } from "@/mock/types";
import type { Adjustments } from "./adjust";
import { rankUpgrades } from "./recommend";
import { useRencana } from "./rencana-state";
import { can } from "@/lib/roles";
import { withAdjust } from "./with-adjust";

const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(n);
const kind = (id: string) => ASSETS.find(a => a.id === id)?.kind ?? "filler";

/**
 * Daftar di Rencana > Rekomendasi upgrade (poin 10). Dihitung ulang dari upgrade yang sedang dicoba dan skenario terpilih:
 * tiap saran menampilkan efeknya ke constraint, dan upgrade yang sudah dicoba pindah ke "Diterapkan ke rencana".
 */
export function UpgradePicks({ onTry }: { onTry: (id: string, pct: number, to: number) => void }) {
  const { adj, setAdj, plans, planId } = useRencana();
  const allowed = can(useDemo().role, "plan.simulate");
  const demo = useDemo();
  const plan = (plans?.find(p => p.id === planId) ?? plans?.[0]) as unknown as Plan | undefined;
  const { picks, skips, tried } = rankUpgrades(asepticTanks, fillers, adj);
  const broken = (a: Adjustments) => plan ? { before: withAdjust(plan, "before", a, demo.limits).broken, after: withAdjust(plan, "after", a, demo.limits).broken } : null;
  const now = broken(adj);
  const release = (id: string) => setAdj(prev => { const next = { ...prev }; delete next[id]; return next; });
  // Revisi 8 Nov poin 7: "Tidak disarankan" jadi tab sendiri supaya mudah dibaca, bukan section lipat di bawah.
  const [tab, setTab] = useState<"disarankan" | "tidak">("disarankan");

  return <section className="upgrade-picks" aria-label="Daftar rekomendasi upgrade">
    {tried.length > 0 && <Card className="upgrade-tried">
      <h2><Icon icon={FlaskConical} size={17} />Diterapkan ke rencana ({tried.length})</h2>
      <ul>{tried.map(x => <li key={x.id}>
        <span><strong className="mono">{x.id}</strong> {fmt(x.from)} ke {fmt(x.to)} L/jam <span className="muted">jalur {x.line}</span></span>
        <span className="upgrade-tried-actions"><Link className="text-link" href="/rencana/alur">Lihat di alur</Link><Button variant="text" onClick={() => release(x.id)}><Icon icon={X} size={14} />Lepas</Button></span>
      </li>)}</ul>
      {now && <p className="small muted">Dengan upgrade ini: rencana awal melanggar {now.before} dari 6 constraint, rekomendasi solver {now.after} dari 6. Angka yang sama dipakai di Kelayakan & keputusan.</p>}
    </Card>}

    <div className="page-tabs"><Toggle label="Jenis rekomendasi" value={tab} onChange={setTab} options={[{ value: "disarankan", label: `Disarankan (${picks.length})` }, { value: "tidak", label: `Tidak disarankan (${skips.length})` }]} /></div>

    {tab === "disarankan" ? picks.length ? <ol className="upgrade-list">
      {picks.map((p, i) => {
        const next = broken({ ...adj, [p.id]: { upgrade: p.pct, upgradeTo: p.from + p.gain } });
        const same = now && next && next.before === now.before && next.after === now.after;
        return <li key={p.id} className="card upgrade-item">
          <span className="upgrade-rank" aria-label={`Peringkat ${i + 1}`}>{i + 1}</span>
          <Equipment kind={kind(p.id)} size={40} />
          <div className="upgrade-body">
            <h3><span className="mono">{p.id}</span> <span className="muted">jalur {p.line}</span></h3>
            <p>{p.reason}</p>
            {now && next && <p className={`upgrade-effect ${next.before < now.before || next.after < now.after ? "ok" : ""}`}>{same ? "Produksi naik, jumlah constraint dilanggar tidak berubah." : `Constraint dilanggar: rencana awal ${now.before} jadi ${next.before}, rekomendasi ${now.after} jadi ${next.after}.`}</p>}
          </div>
          <div className="upgrade-gain">
            <strong><Icon icon={TrendingUp} size={16} />+{fmt(p.gain)} L/jam</strong>
            <span>{fmt(p.from)} ke {fmt(p.from + p.gain)} L/jam (naik {p.pct}%)</span>
            <span>sekitar +{fmt(p.gain * 8)} L per shift 8 jam</span>
          </div>
          {allowed && <Button variant="secondary" onClick={() => onTry(p.id, p.pct, p.from + p.gain)}><Icon icon={Plus} size={16} />Terapkan ke rencana</Button>}
        </li>;
      })}
    </ol> : <p className="card upgrade-empty">Tidak ada upgrade lain yang menambah produksi dengan pengaturan sekarang.</p>
      : skips.length ? <>
        <p className="small muted upgrade-note"><Icon icon={CircleMinus} size={14} />Upgrade alat ini tidak menambah produksi pada pasokan sekarang, jadi sebaiknya tidak dilakukan.</p>
        <ol className="upgrade-list">
          {skips.map((s, i) => <li key={s.id} className="card upgrade-item skip">
            <span className="upgrade-rank" aria-label={`Peringkat ${i + 1}`}>{i + 1}</span>
            <Equipment kind={kind(s.id)} size={40} />
            <div className="upgrade-body">
              <h3><span className="mono">{s.id}</span> <Badge tone="neutral">Tidak disarankan</Badge></h3>
              <p>{s.reason}</p>
            </div>
            <div className="upgrade-gain">
              <strong><Icon icon={CircleMinus} size={16} />0 L/jam</strong>
              <span>Produksi tidak bertambah</span>
            </div>
          </li>)}
        </ol>
      </> : <p className="card upgrade-empty">Tidak ada alat yang dikecualikan dengan pengaturan sekarang.</p>}

    <p className="small muted">Dihitung dari pasokan aseptic tank dan kebutuhan mesin filling yang jalan pada snapshot 14.42, ditambah upgrade yang sudah diterapkan ke rencana. Batas kapasitas mesin dari pabrikan belum ada di data, jadi kelayakan teknis upgrade-nya perlu dicek terpisah [asumsi]. Jalur yang sedang CIP atau siaga tidak dihitung.</p>
  </section>;
}
