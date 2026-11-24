"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { Icon } from "@/components/ui";
import { filterStepsWithAnchors, tourStepsFor, type TourStepDef } from "@/lib/tour-steps";

/**
 * Mesin product tour: menyorot elemen asli halaman (atribut data-tour)
 * dengan lapisan gelap di sekelilingnya dan tooltip penjelasan.
 * Langkah yang elemennya tidak tampil (role/mode lain) dilewati otomatis.
 */

interface Rect { top: number; left: number; width: number; height: number }

const PAD = 6;
const TIP_W = 330;
const TIP_H = 196;

function visibleRect(el: Element): Rect | null {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function presentAnchors(): Set<string> {
  const out = new Set<string>();
  document.querySelectorAll<HTMLElement>("[data-tour]").forEach(el => {
    if (visibleRect(el)) out.add(el.dataset.tour!);
  });
  return out;
}

function tipPosition(rect: Rect): { top: number; left: number } {
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.min(TIP_W, vw - 24);
  const tall = rect.height > vh * 0.55 && rect.left < 48;
  if (tall) {
    // Elemen tinggi di tepi kiri (sidebar): tooltip di sampingnya.
    return { top: Math.max(12, Math.min(rect.top + 96, vh - TIP_H - 12)), left: Math.min(rect.left + rect.width + 14, vw - w - 12) };
  }
  const left = Math.max(12, Math.min(rect.left, vw - w - 12));
  if (rect.top + rect.height + PAD + TIP_H + 14 <= vh) return { top: rect.top + rect.height + PAD + 14, left };
  if (rect.top - PAD - TIP_H - 14 >= 12) return { top: rect.top - PAD - TIP_H - 14, left };
  return { top: Math.max(12, vh - TIP_H - 12), left };
}

export function ProductTour({ runId, role, pathname, onDone, onStart }: {
  runId: number;
  role: string;
  pathname: string;
  onDone: () => void;
  onStart?: () => void;
}) {
  const [steps, setSteps] = useState<TourStepDef[]>([]);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const active = steps.length > 0;
  const doneRef = useRef(onDone);
  const startRef = useRef(onStart);
  useEffect(() => {
    doneRef.current = onDone;
    startRef.current = onStart;
  });

  const close = useCallback(() => {
    setSteps([]);
    setIdx(0);
    setRect(null);
    doneRef.current();
  }, []);

  // Panduan dimulai setiap kali runId naik (tombol Panduan halaman diklik).
  // Jangkar ditunggu sebentar: sebagian kartu halaman baru muncul setelah
  // data server tiba, jadi himpunan langkah diambil yang paling lengkap
  // selama jendela tunggu singkat ini.
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    const defs = tourStepsFor(pathname, role === "manager" ? "executive" : "role");
    let best: TourStepDef[] = [];
    let stable = 0;
    const t0 = Date.now();
    const start = (found: TourStepDef[]) => {
      if (!found.length) { doneRef.current(); return; }
      setSteps(found);
      setIdx(0);
      startRef.current?.();
    };
    const poll = () => {
      if (cancelled) return;
      const found = filterStepsWithAnchors(defs, presentAnchors());
      if (found.length > best.length) { best = found; stable = 0; } else stable++;
      if (found.length === defs.length || (stable >= 2 && best.length > 0) || Date.now() - t0 > 3000) { start(best); return; }
      setTimeout(poll, 300);
    };
    poll();
    return () => { cancelled = true; };
  }, [runId, pathname, role]);

  const step = active ? steps[Math.min(idx, steps.length - 1)] : null;

  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
    setRect(el ? visibleRect(el) : null);
  }, [step]);

  // Setiap ganti langkah: gulir elemen ke tengah, lalu ukur posisinya.
  useEffect(() => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    const t1 = setTimeout(measure, 60);
    const t2 = setTimeout(measure, 380);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [step, measure]);

  // Posisi mengikuti gulir/resize selama tour berjalan.
  useEffect(() => {
    if (!active) return;
    const onMove = () => measure();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => { window.removeEventListener("resize", onMove); window.removeEventListener("scroll", onMove, true); };
  }, [active, measure]);

  const next = useCallback(() => { if (idx + 1 >= steps.length) close(); else setIdx(idx + 1); }, [idx, steps.length, close]);
  const prev = useCallback(() => { if (idx > 0) setIdx(idx - 1); }, [idx]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, close, next, prev]);

  if (!active || !step) return null;
  const last = idx === steps.length - 1;
  const tip = rect ? tipPosition(rect) : { top: Math.max(12, window.innerHeight / 2 - TIP_H / 2), left: Math.max(12, window.innerWidth / 2 - TIP_W / 2) };

  return <div className="tour-root" role="dialog" aria-modal="true" aria-label={`Panduan halaman, langkah ${idx + 1} dari ${steps.length}`}>
    <div className="tour-catcher" onClick={close} />
    {rect && <div className="tour-spot" style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />}
    <div className="tour-tip" style={{ top: tip.top, left: tip.left }}>
      <div className="tour-progress"><span style={{ width: `${(idx + 1) / steps.length * 100}%` }} /></div>
      <button type="button" className="tour-close" aria-label="Tutup panduan" onClick={close}><Icon icon={X} size={16} /></button>
      <p className="tour-count">Langkah {idx + 1} dari {steps.length}</p>
      <h3 className="tour-title">{step.title}</h3>
      <p className="tour-body">{step.body}</p>
      <div className="tour-actions">
        <button type="button" className="button secondary" onClick={prev} disabled={idx === 0}><Icon icon={ArrowLeft} size={15} />Kembali</button>
        <button type="button" className="button primary" onClick={next}>{last ? <><Icon icon={Check} size={15} />Selesai</> : <>Lanjut<Icon icon={ArrowRight} size={15} /></>}</button>
      </div>
    </div>
  </div>;
}
