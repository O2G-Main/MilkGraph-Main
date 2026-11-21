"use client";

import { useState, type FormEvent } from "react";
import { Check, Send, X } from "lucide-react";
import { reviewProposal, submitProposal, useDemo, type Proposal } from "@/lib/demo";
import { can } from "@/lib/roles";
import type { Limits } from "@/lib/rules";
import { Badge, Card, Icon, Modal, SectionTitle } from "@/components/ui";
import { badgeOf, type Adjustments } from "./adjust";
import { useRencana } from "./rencana-state";

const STATUS: Record<Proposal["status"], { label: string; tone: "warn" | "ok" | "neutral" }> = {
  diajukan: { label: "Menunggu Planner", tone: "warn" },
  diterapkan: { label: "Diterapkan", tone: "ok" },
  ditolak: { label: "Ditolak", tone: "neutral" },
};

/** Ringkasan pengaturan alat, mis. "UHT-2: Kapasitas 8.540 L/jam; Bay 3: Maintenance 16.00, 30 menit". */
export const adjustText = (adj: Adjustments) => Object.entries(adj).flatMap(([id, a]) => { const b = badgeOf(a); return b ? [`${id}: ${b}`] : []; }).join("; ");

/** Tombol "Ajukan ke Planner" dengan catatan alasan. Hanya untuk peran yang boleh mengajukan (Supervisor/Manager). */
export function ProposeButton({ kind, title, detail, limits, adjust, disabled }: { kind: Proposal["kind"]; title: string; detail: string; limits?: Limits; adjust?: Adjustments; disabled?: boolean }) {
  const { role } = useDemo();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  if (!can(role, "plan.propose")) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    submitProposal({ kind, title, detail, note: note.trim(), limits, adjust });
    setOpen(false);
    setNote("");
    setSent(true);
  }

  return <>
    <button className="button primary" disabled={disabled} onClick={() => { setSent(false); setOpen(true); }}><Icon icon={Send} size={16} />{sent ? "Terkirim ke Planner" : "Ajukan ke Planner"}</button>
    {open && <Modal title="Ajukan ke Planner?" onClose={() => setOpen(false)}>
      <form className="schedule-form" onSubmit={submit}>
        <p className="muted"><strong>{title}.</strong> {detail}</p>
        <p className="small muted">Planner/PPIC yang memutuskan usulan ini diterapkan ke jadwal aktif atau tidak.</p>
        <label><span className="field-label">Alasan usulan (wajib)</span><textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={400} required placeholder="Contoh: dengan jeda CIP 10 menit, pelanggaran turun dari 3 jadi 1" /></label>
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={() => setOpen(false)}>Batal</button>
          <button type="submit" className="button primary" disabled={!note.trim()}><Icon icon={Send} size={16} />Ajukan</button>
        </div>
      </form>
    </Modal>}
  </>;
}

/** Ajukan pengaturan alat yang sedang dicoba di Rencana (kapasitas, maintenance, upgrade). */
export function ProposeAdjust() {
  const { adj } = useRencana();
  const detail = adjustText(adj);
  return <ProposeButton kind="alat" title="Usulan pengaturan alat" detail={detail || "Belum ada pengaturan alat yang dicoba."} adjust={adj} disabled={!detail} />;
}

/** Daftar usulan simulasi. Planner menerapkan atau menolak; Supervisor/Manager melihat statusnya. */
export function ProposalsCard() {
  const demo = useDemo();
  const { setAdj } = useRencana();
  const mayDecide = can(demo.role, "plan.decide");
  const [review, setReview] = useState<{ p: Proposal; status: "diterapkan" | "ditolak" } | null>(null);
  const [note, setNote] = useState("");
  const list = demo.proposals;
  if (!list.length || !(mayDecide || can(demo.role, "plan.propose"))) return null;
  const waiting = list.filter(p => p.status === "diajukan").length;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!review || (review.status === "ditolak" && !note.trim())) return;
    if (review.status === "diterapkan" && review.p.adjust) setAdj(review.p.adjust);
    reviewProposal(review.p.id, review.status, note.trim());
    setReview(null);
    setNote("");
  }

  return <Card className="rules-card proposals-card">
    <SectionTitle title="Usulan simulasi" subtitle={waiting ? `${waiting} usulan menunggu keputusan Planner.` : "Semua usulan sudah diputuskan."} />
    <ul className="proposal-list">{list.map(p => <li key={p.id}>
      <div className="proposal-top"><strong>{p.title}</strong><Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge></div>
      <p>{p.detail}</p>
      <p className="small muted">&ldquo;{p.note}&rdquo; · {p.by}, {p.at}</p>
      {p.review && <p className="small">{p.status === "diterapkan" ? "Diterapkan" : "Ditolak"} oleh {p.review.by}, {p.review.at}{p.review.note ? `. ${p.review.note}` : ""}</p>}
      {mayDecide && p.status === "diajukan" && <div className="page-actions">
        <button className="button secondary" onClick={() => { setNote(""); setReview({ p, status: "ditolak" }); }}><Icon icon={X} size={16} />Tolak</button>
        <button className="button primary" onClick={() => { setNote(""); setReview({ p, status: "diterapkan" }); }}><Icon icon={Check} size={16} />Terapkan</button>
      </div>}
    </li>)}</ul>
    {review && <Modal title={review.status === "diterapkan" ? "Terapkan usulan ini?" : "Tolak usulan ini?"} onClose={() => setReview(null)}>
      <form className="schedule-form" onSubmit={submit}>
        <p className="muted"><strong>{review.p.title}.</strong> {review.p.detail}</p>
        <p className="small muted">{review.status === "diterapkan"
          ? review.p.kind === "batas" ? "Batas constraint yang berlaku langsung diganti dengan nilai usulan." : "Pengaturan alat masuk ke rencana aktif dan ikut dihitung saat rencana diputuskan."
          : "Usulan tidak dipakai. Tulis alasannya supaya pengusul tahu."}</p>
        <label><span className="field-label">Catatan {review.status === "ditolak" ? "(wajib)" : "(opsional)"}</span><textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={400} placeholder={review.status === "ditolak" ? "Contoh: kapasitas UHT-2 belum bisa dinaikkan sampai perbaikan pompa selesai" : "Contoh: diterapkan mulai shift ini"} /></label>
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={() => setReview(null)}>Batal</button>
          <button type="submit" className="button primary" disabled={review.status === "ditolak" && !note.trim()}>{review.status === "diterapkan" ? "Terapkan" : "Tolak usulan"}</button>
        </div>
      </form>
    </Modal>}
  </Card>;
}
