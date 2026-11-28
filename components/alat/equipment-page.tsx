"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Badge, Card, Icon, Modal, PageHeading, SectionTitle, Toggle } from "@/components/ui";
import { Select } from "@/components/ui/fields";
import { KondisiAlat } from "@/components/kondisi-alat/kondisi-alat";
import { DowntimeApi } from "@/components/kondisi-alat/downtime-api";
import { API_MODE, apiGet, apiSend } from "@/lib/api/client";
import { fmtWaktu } from "@/lib/api/contract";
import { canRecordStatus, createStatusRecorder, EQUIPMENT_PATH, equipmentSpecs, filterEquipment, MISSING_STATUS, toDowntimeMachines, type EquipmentMaster } from "@/lib/api/equipment";
import type { ProductionAsset, ProductionList, ProductionSession } from "@/lib/api/production";
import { invalidateResources, useResource } from "@/lib/api/resource";
import { useDemo } from "@/lib/demo";
import { displayText } from "@/lib/display-text";
import { GreenfieldCatalog } from "./greenfield-catalog";
import { equipmentLocation, type EquipmentView } from "@/lib/equipment-location";
import { ProductionSettings } from "@/components/produksi/production-settings";
import { ProductionLines } from "@/components/produksi/production-lines";

export function EquipmentPage({initialView="catalog",initialAsset=""}:{initialView?:EquipmentView;initialAsset?:string}) {
  const { role } = useDemo();
  const [view, setView] = useState<EquipmentView>(initialView);
  const [asset,setAsset]=useState(initialAsset);
  const changeView=(value:EquipmentView)=>{setView(value);window.history.replaceState(null,"",equipmentLocation(value,value==="status"?asset:undefined));};
  const showStatus=(id:string)=>{setAsset(id);setView("status");window.history.replaceState(null,"",equipmentLocation("status",id));};
  const navigation = <div className="page-tabs production-tabs">
    <Toggle label="Bagian Alat" value={view} onChange={changeView} options={[
      { value: "catalog", label: "Katalog alat" },
      { value: "status", label: "Status" },
      { value: "settings", label: "Pengaturan" },
      ...(API_MODE ? [{ value: "lines" as const, label: "Konfigurasi lini" }] : []),
    ]} />
  </div>;
  if (!API_MODE && view === "status") return <>
    <p className="small muted">Mode demo · data simulasi, bukan katalog backend.</p>
    <KondisiAlat title="Alat" navigation={navigation} />
  </>;
  return <div className="page-enter">
    <PageHeading title="Alat" subtitle="Jelajahi master alat Greenfields, pantau status operasional, dan kelola pengaturan alat." />
    {navigation}
    <div className="production-stack">
      {view === "catalog" && <GreenfieldCatalog onStatus={showStatus} />}
      {view === "status" && <EquipmentApi key={`${role}:${asset}`} role={role} initialSearch={asset} />}
      {view === "settings" && <ProductionSettings role={role} />}
      {view === "lines" && API_MODE && <ProductionLines />}
    </div>
  </div>;
}

function EquipmentApi({ role, initialSearch="" }: { role: string; initialSearch?:string }) {
  const [includePipes, setIncludePipes] = useState(Boolean(initialSearch));
  const statusRegion=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(initialSearch)statusRegion.current?.focus();},[initialSearch]);
  const path = `${EQUIPMENT_PATH}${includePipes ? "?include_pipes=true" : ""}`;
  const assets = useResource<ProductionList<ProductionAsset>>(path);
  const session = useResource<ProductionSession>("/session");
  const [search, setSearch] = useState(initialSearch);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProductionAsset | null>(null);
  const [notice, setNotice] = useState("");
  const rows = assets.data?.items ?? [];
  const shown = filterEquipment(rows, search, type, status);
  const write = canRecordStatus(session.data, role);
  const selected = rows.find(asset => asset.asset_id === detailId);
  const types = [...new Set(rows.map(asset => asset.asset_type))].sort();
  const statuses = [...new Set(rows.flatMap(asset => asset.current_status ? [asset.current_status] : []))].sort();

  return <div ref={statusRegion} tabIndex={-1} role="region" aria-label="Status alat" className="production-stack">
    <div className="page-tabs"><Toggle label="Cakupan status alat" value={includePipes ? "all" : "operational"} onChange={value => { setIncludePipes(value === "all"); setType(""); setStatus(""); }} options={[{ value: "operational", label: "Alat operasional" }, { value: "all", label: "Termasuk pipa" }]} /></div>
    <Card>
      <SectionTitle title="Status alat" subtitle={assets.data ? `${shown.length} dari ${rows.length} alat · ${rows.filter(asset => !asset.current_status).length} belum memiliki status tercatat` : "Status kosong berarti belum tercatat, bukan alat berjalan normal."}
        action={<button type="button" className="button secondary" onClick={() => { void assets.reload(); void session.reload(); }} disabled={assets.loading}>Muat ulang</button>} />
      <div className="asset-toolbar">
        <label className="asset-search"><Icon icon={Search} size={16} /><span className="sr-only">Cari alat</span><input type="search" value={search} onChange={event => setSearch(event.currentTarget.value)} placeholder="Cari kode, nama, jenis, atau status…" /></label>
      </div>
      <div className="schedule-form"><div className="schedule-form-row">
        <label><span className="field-label">Jenis alat</span><Select label="Filter jenis alat" value={type} onChange={setType} options={[{ value: "", label: "Semua jenis" }, ...types.map(value => ({ value, label: value }))]} /></label>
        <label><span className="field-label">Status terakhir</span><Select label="Filter status alat" value={status} onChange={setStatus} options={[{ value: "", label: "Semua status" }, { value: MISSING_STATUS, label: "Belum tercatat" }, ...statuses.map(value => ({ value, label: displayText(value) }))]} /></label>
      </div></div>
      {notice && <p className="ok-text" role="status">{notice}</p>}
      {assets.error && <p className="crit-text" role="alert">Gagal memuat katalog alat: {assets.error.message}</p>}
      {!assets.data && !assets.error && <p className="muted" role="status">Memuat katalog alat…</p>}
      {assets.data && (!shown.length ? <p className="muted asset-empty">{rows.length ? "Tidak ada alat yang cocok dengan pencarian atau filter." : "Belum ada alat di katalog backend."}</p> : <div className="table-wrap"><table className="asset-table">
        <thead><tr><th>Alat</th><th>Jenis</th><th>Status terakhir</th><th>Keterangan</th><th>Aksi</th></tr></thead>
        <tbody>{shown.map(asset => <tr key={asset.asset_id}>
          <td><strong className="mono">{asset.asset_id}</strong><span className="table-sub">{asset.asset_name}</span></td>
          <td data-label="Jenis">{asset.asset_type}</td>
          <td data-label="Status terakhir"><Badge tone="neutral">{displayText(asset.current_status || "Belum tercatat")}</Badge></td>
          <td data-label="Keterangan" className="asset-note">{asset.current_status_reason || "Belum ada keterangan"}{asset.current_status_observed_at && <span className="table-sub">{fmtWaktu(asset.current_status_observed_at)}</span>}</td>
          <td className="table-action queue-actions"><button type="button" className="text-link" aria-label={`Detail ${asset.asset_id}`} onClick={() => setDetailId(asset.asset_id)}>Detail</button>
            {write && <button type="button" className="button secondary" aria-label={`Catat status ${asset.asset_id}`} onClick={() => { setNotice(""); setEditing(asset); }}>Catat status</button>}</td>
        </tr>)}</tbody>
      </table></div>)}
      {session.error ? <p className="crit-text" role="alert">Izin sesi gagal dimuat: {session.error.message}. Pencatatan status tidak tersedia.</p>
        : !session.data ? <p className="small muted" role="status">Memeriksa izin backend…</p>
        : !write && <p className="small muted">Pencatatan status memerlukan izin downtime.record pada sesi backend yang sesuai peran aktif.</p>}
    </Card>
    <DowntimeApi initialResource={initialSearch} role={write ? role : "viewer"} machines={toDowntimeMachines(rows)} />
    {selected && <EquipmentDetail asset={selected} onClose={() => setDetailId(null)} />}
    {editing && write && <EquipmentStatusForm key={editing.asset_id} asset={editing} role={role} onClose={() => setEditing(null)} onSaved={asset => { setNotice(displayText(`Status ${asset.asset_id} tersimpan dan terverifikasi: ${asset.current_status}.`)); setEditing(null); }} />}
  </div>;
}

function EquipmentDetail({ asset, onClose }: { asset: ProductionAsset; onClose: () => void }) {
  const master = useResource<EquipmentMaster[]>("/master/assets");
  const specs = master.data ? equipmentSpecs(asset.asset_id, master.data) : null;
  return <Modal title={`Detail ${asset.asset_id}`} onClose={onClose}>
    <p>{asset.asset_name} · {asset.asset_type}</p>
    <p>Status terakhir: <strong>{asset.current_status || "Belum tercatat"}</strong></p>
    {asset.current_status_reason && <p className="muted">{asset.current_status_reason}</p>}
    {asset.current_status_observed_at && <p className="small muted">Dicatat {fmtWaktu(asset.current_status_observed_at)}</p>}
    <SectionTitle title="Spesifikasi alat" subtitle="Data master sesuai ID alat. Parameter tanpa data ditandai belum tersedia dan tidak dianggap nol." />
    {master.error && <p className="crit-text" role="alert">Gagal memuat spesifikasi: {master.error.message}</p>}
    {!master.data && !master.error && <p className="muted" role="status">Memuat spesifikasi…</p>}
    {master.data && (specs ? <div className="table-wrap"><table className="schedule-table"><tbody>{specs.map(spec => <tr key={spec.key}><th scope="row">{spec.label}</th><td>{spec.value}</td></tr>)}</tbody></table></div> : <p className="muted">Spesifikasi untuk ID {asset.asset_id} belum tersedia di master.</p>)}
    {master.error && <button type="button" className="button secondary" onClick={() => void master.reload()}>Coba lagi</button>}
    <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Tutup</button></div>
  </Modal>;
}

function EquipmentStatusForm({ asset, role, onClose, onSaved }: { asset: ProductionAsset; role: string; onClose: () => void; onSaved: (asset: ProductionAsset) => void }) {
  const [recorder] = useState(() => createStatusRecorder({ get: apiGet, send: apiSend }));
  const lock = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [verifyOnly, setVerifyOnly] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setSaving(true); setError("");
    try {
      const result = await recorder.save(asset.asset_id, status, reason, role);
      invalidateResources([EQUIPMENT_PATH]);
      onSaved(result);
    } catch (error) {
      setVerifyOnly(recorder.pendingVerification);
      if (recorder.pendingVerification) invalidateResources([EQUIPMENT_PATH]);
      setError(error instanceof Error ? error.message : "Status gagal dicatat.");
    } finally { lock.current = false; setSaving(false); }
  }
  return <Modal title={`Catat status ${asset.asset_id}`} onClose={() => { if (!lock.current) onClose(); }}>
    <form className="schedule-form" onSubmit={save} noValidate>
      <p className="muted">Status saat ini: {asset.current_status || "Belum tercatat"}. Perubahan status tidak otomatis mencatat kejadian downtime.</p>
      <label><span className="field-label">Status baru (wajib)</span><input name="status" required value={status} onChange={event => setStatus(event.currentTarget.value)} placeholder="Contoh: Maintenance" disabled={saving || verifyOnly} /></label>
      <label><span className="field-label">Alasan (opsional)</span><textarea name="reason" rows={3} value={reason} onChange={event => setReason(event.currentTarget.value)} disabled={saving || verifyOnly} /></label>
      {error && <p className="crit-text" role="alert">{error}</p>}
      {verifyOnly && <p className="small muted">Status sudah dikirim. Tombol berikut hanya membaca ulang backend, tidak mengirim perubahan lagi.</p>}
      <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose} disabled={saving}>Tutup</button><button type="submit" className="button primary" disabled={saving}>{saving ? "Memproses…" : verifyOnly ? "Verifikasi ulang" : "Simpan status"}</button></div>
    </form>
  </Modal>;
}
