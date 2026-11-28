"use client";

import { useEffect, useRef, type ReactNode, type ComponentProps } from "react";
import { ArrowUpRight, X, Database, type LucideIcon } from "lucide-react";
import { scenario } from "@/lib/data";
import { API_MODE } from "@/lib/api/client";
import { useResource } from "@/lib/api/resource";
import type { Source } from "@/mock/types";
import type { Block, Tone } from "@/mock/types";
import { time } from "@/lib/format";
import Link from "next/link";
import { useDemo } from "@/lib/demo";
import { displayText } from "@/lib/display-text";
import { readableModalContent, ModalDisplayContext } from "./modal-content";
import { findNav } from "@/lib/nav";
import { canSee } from "@/lib/roles";

/** Tautan ke halaman lain yang hanya muncul bila halaman itu terbuka untuk peran aktif. `inline`: tampilkan teksnya saja tanpa tautan. */
export function PageLink({ inline, ...props }: ComponentProps<typeof Link> & { inline?: boolean }) {
  const { role } = useDemo();
  const path = String(props.href).split(/[?#]/)[0];
  if (canSee(role, findNav(path).tab.href)) return <Link {...props} />;
  return inline ? <>{props.children}</> : null;
}

export function Icon({ icon: Glyph, size = 18, ...props }: { icon: LucideIcon; size?: number } & ComponentProps<"svg">) {
  return <Glyph size={size} strokeWidth={1.75} aria-hidden="true" {...props} />;
}
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${tone}`}><span className="status-dot" />{children}</span>;
}
export type ButtonVariant = "primary" | "secondary" | "inverse" | "icon" | "text" | "inline";
const BUTTON_CLASSES: Record<ButtonVariant, string> = {
  primary: "button primary",
  secondary: "button secondary",
  inverse: "button inverse",
  icon: "icon-button",
  text: "text-link",
  inline: "inline-link",
};
export function buttonClass(variant: ButtonVariant = "secondary", wide = false, className = "") {
  return [BUTTON_CLASSES[variant], wide ? "wide" : "", className].filter(Boolean).join(" ");
}
export function Button({ variant = "secondary", wide = false, className = "", type = "button", ...props }: ComponentProps<"button"> & { variant?: ButtonVariant; wide?: boolean }) {
  return <button type={type} className={buttonClass(variant, wide, className)} {...props} />;
}

export function Card({ variant = "card", children, className = "", ...props }: ComponentProps<"section"> & { variant?: "card" | "panel" }) {
  return <section className={[variant, className].filter(Boolean).join(" ")} {...props}>{children}</section>;
}

export type TableVariant = "schedule" | "rules" | "asset" | "select" | "access" | "matrix" | "user" | "constraint";
export function Table({ variant, wrapClassName = "", caption, className = "", children, ...props }: ComponentProps<"table"> & {
  variant?: TableVariant; wrapClassName?: string; caption?: ReactNode;
}) {
  const tableClass = [variant ? `${variant}-table` : "", className].filter(Boolean).join(" ") || undefined;
  return <div className={["table-wrap", wrapClassName].filter(Boolean).join(" ")}>
    <table className={tableClass} {...props}>{caption ? <caption>{caption}</caption> : null}{children}</table>
  </div>;
}

export { Input, Textarea, Field } from "./fields";
export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="section-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}
export function Modal({ title, onClose, children, className = "" }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; active?.focus(); };
  }, []);
  return <dialog ref={dialog} className={`modal ${className}`} aria-label={displayText(title)} onCancel={event => { event.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-body"><div className="section-heading"><h2>{displayText(title)}</h2><button className="icon-button" aria-label="Tutup dialog" onClick={onClose}><Icon icon={X} /></button></div><ModalDisplayContext.Provider value={true}>{readableModalContent(children)}</ModalDisplayContext.Provider></div>
  </dialog>;
}
export function SourceButton({ id, onSelect, onHighlight, compact = false }: { id: string; onSelect: (id: string) => void; onHighlight?: (id: string | null) => void; compact?: boolean }) {
  const sources = useResource<Source[]>(API_MODE ? "/sources" : null);
  const source = API_MODE ? sources.data?.find(s => s.id === id) : scenario.sources.find(s => s.id === id);
  return <button className={`source-chip ${compact ? "compact" : ""}`} onClick={() => onSelect(id)} onMouseEnter={() => onHighlight?.(source?.node ?? null)} onMouseLeave={() => onHighlight?.(null)} onFocus={() => onHighlight?.(source?.node ?? null)} onBlur={() => onHighlight?.(null)} aria-label={`Lihat sumber ${id}`}><Icon icon={Database} size={13} /><span>{id}{!compact && source && ` · ${source.time}`}</span><Icon icon={ArrowUpRight} size={13} /></button>;
}
export function SourceModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const resource = useResource<Source>(API_MODE && id ? `/sources/${encodeURIComponent(id)}` : null);
  if (!id) return null;
  const source = API_MODE ? resource.data : scenario.sources.find(s => s.id === id);
  if (API_MODE && resource.loading && !source) {
    return <Modal title="Bukti operasional" onClose={onClose}><p className="muted" role="status">Memuat bukti operasional…</p></Modal>;
  }
  if (API_MODE && resource.error) {
    return <Modal title="Bukti operasional" onClose={onClose}><p className="crit-text" role="alert">Gagal memuat bukti: {resource.error.message}</p><button className="button secondary wide" onClick={onClose}>Tutup</button></Modal>;
  }
  if (!source) {
    return <Modal title="Bukti operasional" onClose={onClose}><p className="muted">Bukti {id} tidak ditemukan.</p><button className="button secondary wide" onClick={onClose}>Tutup</button></Modal>;
  }
  return <Modal title="Bukti operasional" onClose={onClose}><h3 className="source-title">{source.title}</h3><p className="mono muted">{source.id} · {source.time}</p><p className="source-detail">{source.detail}</p><button className="button secondary wide" onClick={onClose}>Selesai membaca</button></Modal>;
}
export function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label: string }) {
  return <div className="toggle" role="group" aria-label={label}>{options.map(option => <button key={option.value} aria-pressed={value === option.value} className={value === option.value ? "selected" : ""} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}
export function PageHeading({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{children && <div className="page-actions">{children}</div>}</div>;
}
/** Gantt 13.00 - 20.00 dengan garis "sekarang"; blok bisa diklik untuk membuka sumbernya. */
export function Timeline({ blocks, resources, onSource }: { blocks: Block[]; resources: string[]; onSource: (id: string) => void }) {
  const meta = useResource<{ now: string }>(API_MODE ? "/meta" : null);
  const now = API_MODE && meta.data ? meta.data.now : scenario.now;
  return <div className="gantt-scroll" tabIndex={0} role="region" aria-label="Timeline rencana. Gulir ke samping untuk melihat semua jam."><div className="gantt"><div className="gantt-header"><span>Sumber daya</span><div className="gantt-hours">{Array.from({ length: 8 }, (_, i) => <span key={i}>{13 + i}.00</span>)}</div></div><div className="gantt-rows">{resources.map(resource => <div className="gantt-row" key={resource}><span className="resource-name">{resource}</span><div className="gantt-track">{blocks.filter(b => b.resource === resource).map((block, i) => <button key={`${block.label}-${i}`} className={`gantt-block ${block.type}`} style={{ left: `${block.start / 420 * 100}%`, width: `${(block.end - block.start) / 420 * 100}%` }} onClick={() => onSource(block.source)} title={`${resource}: ${block.label}, ${time(block.start)} - ${time(block.end)}`} aria-label={`${resource}, ${block.label}, ${time(block.start)} sampai ${time(block.end)}, ${block.end - block.start} menit. Lihat sumber.`}>{block.label}</button>)}</div></div>)}<div className="now-line"><span>Sekarang {now}</span></div></div></div></div>;
}
