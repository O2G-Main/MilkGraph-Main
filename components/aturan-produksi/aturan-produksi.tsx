"use client";

import { ArrowRight } from "lucide-react";
import { setChangeoverRule, setCipRule, setPaperRule, useDemo } from "@/lib/demo";
import { can } from "@/lib/roles";
import { SOP_CHANGEOVER } from "@/lib/rules";
import { CIP_STANDARD, PAPER_STANDARD, type CipGroup } from "@/lib/production";
import { Badge, Card, Icon, PageHeading, PageLink, SectionTitle } from "@/components/ui";
import { QualityRules } from "./quality-rules";
import { RuleValue } from "./rule-dialog";

const statusOf = (value: number, standard: number) => value === standard ? <Badge tone="ok">Sesuai standar</Badge> : <Badge tone="warn">+{value - standard} menit dari standar</Badge>;

export function AturanProduksi() {
  const demo = useDemo();
  const allowed = can(demo.role, "rules.edit");
  const { rules } = demo;
  // QA/QC melihat bagiannya sendiri paling atas.
  const qaFirst = can(demo.role, "quality.rules") && !allowed;

  return (
    <div className="page-enter">
      <PageHeading title="Aturan Produksi" subtitle="Durasi changeover dan CIP untuk jadwal (Planner), serta batas holding time dan ketentuan mutu (QA/QC). Changeover dan CIP boleh lebih lama dari standar, tapi tidak boleh lebih singkat." />
      {qaFirst && <QualityRules />}
      <Card className="rules-card">
        <SectionTitle title="Changeover antar-produk" subtitle="Dipakai di Penjadwalan untuk jeda antar-order dan di cek kelayakan Rencana." action={<PageLink className="text-link" href="/penjadwalan">Lihat jadwal<Icon icon={ArrowRight} size={14} /></PageLink>} />
        <div className="table-wrap">
          <table className="rules-table">
            <thead><tr><th>Dari</th><th>Ke</th><th className="numeric">Standar SOP</th><th>Durasi dipakai</th><th>Status</th></tr></thead>
            <tbody>
              {Object.entries(SOP_CHANGEOVER).map(([key, standard]) => {
                const [from, to] = key.split(">");
                const value = rules.changeover[key] ?? standard;
                return (
                  <tr key={key}>
                    <td data-label="Dari">{from}</td>
                    <td data-label="Ke">{to}</td>
                    <td data-label="Standar SOP" className="numeric">{standard} menit</td>
                    <td data-label="Durasi dipakai"><RuleValue title={`Ubah changeover ${from} ke ${to}`} label={`Changeover ${from} ke ${to}`} value={value} unit="menit" min={standard} max={standard + 120} step={5} note={`Standar SOP ${standard} menit. Changeover boleh lebih lama, tidak boleh lebih singkat.`} allowed={allowed} onSave={m => setChangeoverRule(key, m)} /></td>
                    <td data-label="Status">{statusOf(value, standard)}</td>
                  </tr>
                );
              })}
              <tr>
                <td data-label="Dari" colSpan={2}>Ganti roll kemasan (paper), semua produk</td>
                <td data-label="Standar SOP" className="numeric">{PAPER_STANDARD} menit</td>
                <td data-label="Durasi dipakai"><RuleValue title="Ubah durasi ganti roll kemasan" label="Ganti roll kemasan" value={rules.paper} unit="menit" min={PAPER_STANDARD} max={PAPER_STANDARD + 120} step={5} note={`Standar SOP ${PAPER_STANDARD} menit untuk semua produk.`} allowed={allowed} onSave={setPaperRule} /></td>
                <td data-label="Status">{statusOf(rules.paper, PAPER_STANDARD)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="small muted">Standar SOP changeover [asumsi] sama dengan matriks di halaman Lini Filling. Ganti ukuran kemasan butuh penggantian format; ganti rasa butuh bilas produk.</p>
      </Card>
      <Card>
        <SectionTitle title="Durasi CIP per kelompok alat" subtitle="Lama satu siklus cleaning in place sampai alat siap dipakai lagi." />
        <div className="table-wrap">
          <table className="rules-table">
            <thead><tr><th>Kelompok alat</th><th className="numeric">Standar</th><th>Durasi dipakai</th><th>Status</th><th>Dipakai di cek kelayakan</th></tr></thead>
            <tbody>
              {(Object.keys(CIP_STANDARD) as CipGroup[]).map(group => {
                const std = CIP_STANDARD[group];
                const value = rules.cip[group];
                return (
                  <tr key={group}>
                    <td data-label="Kelompok alat">{std.label}</td>
                    <td data-label="Standar" className="numeric">{std.minutes} menit</td>
                    <td data-label="Durasi dipakai"><RuleValue title={`Ubah durasi CIP ${std.label}`} label={`CIP ${std.label}`} value={value} unit="menit" min={std.minutes} max={std.minutes + 240} step={5} note={`Standar CIP ${std.minutes} menit. Durasi boleh lebih lama, tidak boleh lebih singkat.`} allowed={allowed} onSave={m => setCipRule(group, m)} /></td>
                    <td data-label="Status">{statusOf(value, std.minutes)}</td>
                    <td data-label="Dipakai di cek kelayakan">{std.usedInPlan ? <Badge tone="ok">Ya, CIP bay</Badge> : <span className="small muted">Belum, dicatat untuk jadwal berikutnya</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small muted">Standar CIP [asumsi]. Durasi CIP bay dipakai di cek kelayakan Rencana: kalau diperpanjang, RT tidak boleh bongkar di bay itu sebelum CIP selesai.</p>
      </Card>
      {!qaFirst && <QualityRules />}
    </div>
  );
}
