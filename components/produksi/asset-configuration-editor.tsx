"use client";

import { useRef, useState, type FormEvent } from "react";
import { Badge, Modal, SectionTitle } from "@/components/ui";
import { API_MODE, apiGet, apiSend, type ApiError } from "@/lib/api/client";
import { useResource, invalidateResources } from "@/lib/api/resource";
import { configurationChanges, configurationEditable, createConfigurationSaver, type AssetConfiguration } from "@/lib/api/asset-configuration";
import type { ProductionSession } from "@/lib/api/production";
import { recordedStatusTime } from "@/lib/factory-monitor";
import styles from "./process-management.module.css";

export function AssetConfigurationPanel({ id, role }: { id: string; role: string }) {
  const resource = useResource<AssetConfiguration>(API_MODE ? `/production/assets/${encodeURIComponent(id)}/configuration` : null);
  const session = useResource<ProductionSession>(API_MODE ? "/session" : null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const config = resource.data;
  const valid = config?.asset_id === id && Array.isArray(config.fields) && config.values && Number.isSafeInteger(config.version);
  const allowed = !session.error && !session.loading && configurationEditable(session.data, role);
  return <section className={styles.configuration} aria-label="Parameter per alat">
    <SectionTitle title="Parameter per alat" subtitle="Parameter dan batas input mengikuti jenis alat yang diberikan backend. Perubahan tersimpan untuk alat ini dan digunakan saat pembacaan atau perhitungan berikutnya." />
    {resource.error ? <div role="alert"><p className="warn-text">{(resource.error as ApiError).status === 404 || (resource.error as ApiError).status === 405 ? "Layanan konfigurasi per alat belum tersedia pada backend aktif. Spesifikasi master tetap dapat dibaca." : `Konfigurasi belum dapat dibaca: ${resource.error.message}`}</p><button className="button secondary" onClick={() => void resource.reload()}>Periksa layanan konfigurasi</button></div>
    : !config ? <p role="status" className="muted">Memuat parameter alat…</p>
    : !valid ? <p role="alert" className="crit-text">Format konfigurasi alat dari backend belum dapat dibaca.</p>
    : <>
      {notice && <p role="status" className="ok-text">{notice}</p>}
      <p className="small muted">Versi {config.version} · {config.updated_at ? `Diperbarui ${recordedStatusTime(config.updated_at)}` : "Belum pernah diubah dari konfigurasi awal"}</p>
      {!config.fields.length ? <p className="muted">Jenis alat ini belum memiliki parameter yang dapat diatur di backend.</p>
      : <><dl className={styles.specs}>{config.fields.map(field => <div key={field.key}><dt>{field.label} ({field.unit})</dt><dd>{config.values[field.key] == null ? "Belum ditetapkan" : new Intl.NumberFormat("id-ID").format(config.values[field.key]!)}</dd></div>)}</dl>
        {allowed ? <button className="button primary" onClick={() => { setNotice(""); setEditing(true); }}>Atur parameter {id}</button>
        : <p className="small muted">{session.error ? "Izin backend gagal dimuat; konfigurasi hanya dapat dibaca." : session.loading || !session.data ? "Memeriksa izin backend…" : "Konfigurasi dapat dilihat. Pengubahan memerlukan izin constraint.edit pada sesi backend."}</p>}
      </>}
      {editing && <ConfigurationForm config={config} role={role} onClose={() => { setEditing(false); void resource.reload(); }} onSaved={async () => {
        invalidateResources(["/production/assets", "/master/assets", "/master/topology", "/master/lines", "/audit", "/schedules"]);
        await resource.reload();
        setEditing(false); setNotice(`Konfigurasi ${id} tersimpan dan sudah diverifikasi dari backend.`);
      }} />}
    </>}
  </section>;
}
function ConfigurationForm({ config, role, onClose, onSaved }: { config: AssetConfiguration; role: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<Record<string,string>>({});
  const [saver] = useState(() => createConfigurationSaver({get:apiGet,send:apiSend}));
  const lock = useRef(false);
  const [saving,setSaving] = useState(false);
  const [pending,setPending] = useState(false);
  const [error,setError] = useState("");
  const dirty = config.fields.some(field => draft[field.key] !== undefined && draft[field.key] !== String(config.values[field.key] ?? ""));
  async function save(event: FormEvent) {
    event.preventDefault();if(lock.current)return;
    lock.current=true;setSaving(true);setError("");
    try { configurationChanges(config,draft);await saver.save(config,draft,role);await onSaved(); }
    catch(err){setPending(saver.pendingVerification);setError(err instanceof Error ? err.message : "Konfigurasi gagal disimpan.");}
    finally{lock.current=false;setSaving(false);}
  }
  return <Modal title={`Atur parameter ${config.asset_id}`} onClose={() => {if(!lock.current)onClose();}}>
    <form className="schedule-form" onSubmit={save}>
      <Badge tone="neutral">{config.asset_type}</Badge>
      <p className="small muted">Mengubah konfigurasi alat {config.asset_id}, versi {config.version}. Jadwal dan prediksi yang sudah tersimpan tidak dihitung ulang otomatis.</p>
      <div className="production-settings-grid">{config.fields.map(field => <label key={field.key}>
        <span className="field-label">{field.label} ({field.unit})</span>
        <input aria-label={`${field.label} (${field.unit})`} aria-describedby={`config-help-${field.key}`} type="number" required={!field.nullable} min={field.min} max={field.max} step={field.step} value={draft[field.key] ?? config.values[field.key] ?? ""} disabled={saving||pending} placeholder="Belum ditetapkan" onChange={event => {setDraft(previous=>({...previous,[field.key]:event.target.value}));setError("");}} />
        <span id={`config-help-${field.key}`} className="small muted">{field.min}–{field.max} {field.unit}{field.nullable ? "; kosongkan jika belum ditetapkan" : ""}</span>
      </label>)}</div>
      {error&&<p role="alert" className="crit-text">{error}</p>}
      {pending&&<p className="small muted">Permintaan mungkin sudah tersimpan. Verifikasi ulang hanya membaca backend dan tidak mengirim perubahan lagi. Tutup dialog untuk memuat konfigurasi terbaru sebelum membuat perubahan baru.</p>}
      <div className="dialog-actions"><button type="button" className="button secondary" disabled={saving} onClick={onClose}>Tutup</button><button type="submit" className="button primary" disabled={saving||(!dirty&&!pending)}>{saving?"Memproses…":pending?"Verifikasi ulang":"Simpan konfigurasi alat"}</button></div>
    </form>
  </Modal>;
}
