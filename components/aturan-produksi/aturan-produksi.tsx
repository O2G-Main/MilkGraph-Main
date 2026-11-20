"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { setChangeoverRule, setCipRule, setPaperRule, useDemo } from "@/lib/demo";
import { can } from "@/lib/roles";
import { SOP_CHANGEOVER } from "@/lib/rules";
import { CIP_STANDARD, PAPER_STANDARD, belowStandard, type CipGroup } from "@/lib/production";
import { Badge, Card, Icon, PageHeading, RoleNote, SectionTitle } from "@/components/ui";

/** Isian menit per aturan: tidak boleh di bawah standar yang disepakati, disimpan per baris. */
function RuleInput({ label, value, standard, onSave, allowed }: { label: string; value: number; standard: number; onSave: (minutes: number) => void; allowed: boolean }) {
  const [draft, setDraft] = useState(String(value));
  const minutes = Number(draft);
  const dirty = minutes !== value;
  const invalid = belowStandard(minutes, standard);
  if (!allowed) return <span className="numeric">{value} menit</span>;
  return (
    <form className="rule-input" onSubmit={e => { e.preventDefault(); if (dirty && !invalid) onSave(minutes); }}>
      <input type="number" inputMode="numeric" min={standard} step={5} value={draft} onChange={e => setDraft(e.target.value)} aria-label={`${label}, menit`} aria-invalid={invalid} />
      <span className="small muted">menit</span>
      <button type="submit" className="button secondary" disabled={!dirty || invalid}><Icon icon={Check} size={14} />Simpan</button>
      {invalid && <span className="small crit-text rule-error" role="alert">Minimal {standard} menit sesuai standar.</span>}
    </form>
  );
}

const statusOf = (value: number, standard: number) => value === standard ? <Badge tone="ok">Sesuai standar</Badge> : <Badge tone="warn">+{value - standard} menit dari standar</Badge>;

export function AturanProduksi() {
  const demo = useDemo();
  const allowed = can(demo.role, "rules.edit");
  const { rules } = demo;

  return (
    <div className="page-enter">
      <PageHeading title="Aturan Produksi" subtitle="Durasi changeover dan CIP yang dipakai saat menyusun jadwal. Nilainya boleh lebih lama dari standar yang disepakati, tapi tidak boleh lebih singkat." />
      <RoleNote permission="rules.edit" />
      <Card className="rules-card">
        <SectionTitle title="Changeover antar-produk" subtitle="Dipakai di Penjadwalan untuk jeda antar-order dan di cek kelayakan Rencana." action={<Link className="text-link" href="/penjadwalan">Lihat jadwal<Icon icon={ArrowRight} size={14} /></Link>} />
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
                    <td data-label="Durasi dipakai"><RuleInput key={value} label={`Changeover ${from} ke ${to}`} value={value} standard={standard} allowed={allowed} onSave={m => setChangeoverRule(key, m)} /></td>
                    <td data-label="Status">{statusOf(value, standard)}</td>
                  </tr>
                );
              })}
              <tr>
                <td data-label="Dari" colSpan={2}>Ganti roll kemasan (paper), semua produk</td>
                <td data-label="Standar SOP" className="numeric">{PAPER_STANDARD} menit</td>
                <td data-label="Durasi dipakai"><RuleInput key={rules.paper} label="Ganti roll kemasan" value={rules.paper} standard={PAPER_STANDARD} allowed={allowed} onSave={setPaperRule} /></td>
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
                    <td data-label="Durasi dipakai"><RuleInput key={value} label={`CIP ${std.label}`} value={value} standard={std.minutes} allowed={allowed} onSave={m => setCipRule(group, m)} /></td>
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
    </div>
  );
}
