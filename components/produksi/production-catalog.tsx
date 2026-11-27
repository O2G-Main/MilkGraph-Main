"use client";

import { useState, type FormEvent } from "react";
import { Card, Modal, SectionTitle } from "@/components/ui";
import { apiSend } from "@/lib/api/client";
import { fmtWaktu } from "@/lib/api/contract";
import { invalidateResources, useResource } from "@/lib/api/resource";
import type { ProductionAsset, ProductionCatalog as Catalog, ProductionList, ProductionSession } from "@/lib/api/production";

export function ProductionCatalog({ role }: { role: string }) {
  const assets = useResource<ProductionList<ProductionAsset>>("/production/assets");
  const catalog = useResource<Catalog>("/production/products");
  const session = useResource<ProductionSession>("/session");
  const canRecord = session.data?.role === role && session.data.permissions.includes("downtime.record");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ProductionAsset | null>(null);
  const [notice, setNotice] = useState("");
  const query = search.trim().toLowerCase();
  const shown = (assets.data?.items ?? []).filter(asset =>
    `${asset.asset_id} ${asset.asset_name} ${asset.asset_type}`.toLowerCase().includes(query));
  const skus = catalog.data?.finished_skus ?? [];
  const products = new Map((catalog.data?.products ?? []).map(product => [product.sku_id, product.product_name]));

  return <>
    <Card>
      <SectionTitle title="Status aset" subtitle="Status terakhir yang tercatat di backend. Berlaku lintas tanggal produksi." />
      <label className="schedule-form production-search"><span className="field-label">Cari aset</span>
        <input type="search" value={search} onChange={event => setSearch(event.currentTarget.value)} /></label>
      {notice && <p role="status" className="ok-text">{notice}</p>}
      {assets.error ? <p className="crit-text" role="alert">Gagal memuat aset: {assets.error.message}</p>
      : assets.loading && !assets.data ? <p className="muted" role="status">Memuat aset…</p>
      : !shown.length ? <p className="muted">Tidak ada aset yang cocok.</p>
      : <div className="table-wrap"><table className="schedule-table">
        <thead><tr><th>Aset</th><th>Jenis</th><th>Status terakhir</th>{canRecord && <th>Aksi</th>}</tr></thead>
        <tbody>{shown.map(asset => <tr key={asset.asset_id}>
          <td><strong>{asset.asset_id}</strong><span className="table-sub">{asset.asset_name}</span></td>
          <td>{asset.asset_type}</td><td>{asset.current_status ?? "Belum tercatat"}
            {asset.current_status_reason && <span className="table-sub">{asset.current_status_reason}</span>}
            {asset.current_status_observed_at && <span className="table-sub">{fmtWaktu(asset.current_status_observed_at)}</span>}</td>
          {canRecord && <td><button type="button" className="text-link" aria-label={`Catat status ${asset.asset_id}`}
            onClick={() => { setSelected(asset); setNotice(""); }}>Catat status</button></td>}
        </tr>)}</tbody>
      </table></div>}
    </Card>
    <Card>
      <SectionTitle title="Katalog produk" subtitle="SKU jadi yang tersedia saat membuat batch." />
      {catalog.error ? <p className="crit-text" role="alert">Gagal memuat produk: {catalog.error.message}</p>
      : catalog.loading && !catalog.data ? <p className="muted" role="status">Memuat produk…</p>
      : !skus.length ? <p className="muted">Katalog produk belum tersedia.</p>
      : <div className="table-wrap"><table className="schedule-table">
        <thead><tr><th>SKU jadi</th><th>Produk</th></tr></thead>
        <tbody>{skus.map(sku => <tr key={sku.finished_sku_id}><td>{sku.finished_sku_id}</td><td>{products.get(sku.liquid_sku_id) ?? sku.liquid_sku_id}</td></tr>)}</tbody>
      </table></div>}
    </Card>
    {selected && canRecord && <StatusForm asset={selected} role={role} onClose={() => setSelected(null)}
      onSaved={() => { setNotice(`Status ${selected.asset_id} tercatat.`); setSelected(null); }} />}
  </>;
}

function StatusForm({ asset, role, onClose, onSaved }: {
  asset: ProductionAsset; role: string; onClose: () => void; onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const status = String(form.get("status") ?? "").trim();
    const reason = String(form.get("reason") ?? "").trim();
    if (!status) { setError("Masukkan status aset."); return; }
    setSaving(true);
    setError(null);
    try {
      await apiSend("POST", `/production/assets/${encodeURIComponent(asset.asset_id)}/status`, {
        status, ...(reason && { status_reason: reason }), source: "manual",
      }, role);
      invalidateResources(["/production/assets"]);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status gagal dicatat.");
    } finally {
      setSaving(false);
    }
  }

  return <Modal title={`Catat status ${asset.asset_id}`} onClose={onClose}>
    <form className="schedule-form" onSubmit={save}>
      <label><span className="field-label">Status baru</span><input name="status" defaultValue={asset.current_status ?? ""} placeholder="Contoh: Maintenance" required disabled={saving} /></label>
      <label><span className="field-label">Alasan (opsional)</span><textarea name="reason" rows={2} disabled={saving} /></label>
      {error && <p className="crit-text" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={onClose} disabled={saving}>Batal</button>
        <button type="submit" className="button primary" disabled={saving}>{saving ? "Menyimpan…" : "Simpan status"}</button>
      </div>
    </form>
  </Modal>;
}
