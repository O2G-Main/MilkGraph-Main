"use client";

import { useRef, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Icon, Modal } from "@/components/ui";
import { apiSend } from "@/lib/api/client";
import { invalidateResources, useResource } from "@/lib/api/resource";
import type { ProductionAsset, ProductionCatalog, ProductionList } from "@/lib/api/production";

export function ProductionBatchForm({ date, role, onClose, onSaved }: {
  date: string; role: string; onClose: () => void; onSaved: () => void;
}) {
  const catalog = useResource<ProductionCatalog>("/production/products");
  const assets = useResource<ProductionList<ProductionAsset>>("/production/assets");
  const skuOptions = catalog.data?.finished_skus ?? [];
  const available = assets.data?.items ?? [];
  const filling = available.filter(asset => asset.asset_type === "Filling Line");
  const tanks = available.filter(asset => asset.asset_type === "Aseptic Tank");
  const sterilizers = available.filter(asset => asset.asset_type === "Sterilizer");
  const nextLine = useRef(1);
  const [lineKeys, setLineKeys] = useState([0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadError = catalog.error ?? assets.error;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const lines = lineKeys.map(key => {
      const tank = value(`tank-${key}`), sterilizer = value(`sterilizer-${key}`), packCount = value(`packs-${key}`);
      return {
        finished_sku_id: value(`sku-${key}`),
        filling_line_id: value(`filling-${key}`),
        target_volume_l: Number(value(`volume-${key}`)),
        ...(tank && { aseptic_tank_id: tank }),
        ...(sterilizer && { sterilizer_id: sterilizer }),
        ...(packCount && { target_packs: Number(packCount) }),
      };
    });
    setSaving(true);
    setError(null);
    try {
      await apiSend("POST", "/production/batches", { production_date: date, lines }, role);
      invalidateResources(["/production/daily", "/production/schedule"]);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch gagal dibuat.");
    } finally {
      setSaving(false);
    }
  }

  return <Modal title="Buat batch produksi" onClose={onClose}>
    <p className="small muted">Tanggal produksi {date} (WIB). Kode batch dibuat oleh backend.</p>
    {loadError ? <p className="crit-text" role="alert">Gagal memuat katalog: {loadError.message}</p>
    : !catalog.data || !assets.data ? <p className="muted" role="status">Memuat SKU dan lini…</p>
    : !skuOptions.length || !filling.length ? <p className="muted">Katalog SKU atau lini filling belum tersedia.</p>
    : <form className="schedule-form production-entry-form" onSubmit={submit}>
      {lineKeys.map((key, index) => <fieldset key={key} className="production-batch-line" disabled={saving}>
        <legend>Baris {index + 1}</legend>
        <div className="production-settings-grid">
          <label><span className="field-label">SKU jadi</span><select name={`sku-${key}`} defaultValue="" required>
            <option value="" disabled>Pilih SKU</option>
            {skuOptions.map(sku => <option key={sku.finished_sku_id} value={sku.finished_sku_id}>{sku.finished_sku_id}</option>)}
          </select></label>
          <label><span className="field-label">Lini filling</span><select name={`filling-${key}`} defaultValue="" required>
            <option value="" disabled>Pilih lini</option>
            {filling.map(asset => <option key={asset.asset_id}>{asset.asset_id}</option>)}
          </select></label>
          <label><span className="field-label">Tangki aseptik</span><select name={`tank-${key}`}>
            <option value="">Belum ditentukan</option>
            {tanks.map(asset => <option key={asset.asset_id}>{asset.asset_id}</option>)}
          </select></label>
          <label><span className="field-label">Sterilizer</span><select name={`sterilizer-${key}`}>
            <option value="">Belum ditentukan</option>
            {sterilizers.map(asset => <option key={asset.asset_id}>{asset.asset_id}</option>)}
          </select></label>
          <label><span className="field-label">Target volume (L)</span><input name={`volume-${key}`} type="number" inputMode="decimal" min={0.01} step="any" required /></label>
          <label><span className="field-label">Target pak (opsional)</span><input name={`packs-${key}`} type="number" inputMode="numeric" min={1} /></label>
        </div>
        {lineKeys.length > 1 && <button type="button" className="text-link" onClick={() => setLineKeys(keys => keys.filter(id => id !== key))}>
          <Icon icon={Trash2} size={14} />Hapus baris {index + 1}
        </button>}
      </fieldset>)}
      <button type="button" className="text-link" disabled={saving} onClick={() => {
        const key = nextLine.current++;
        setLineKeys(keys => [...keys, key]);
      }}><Icon icon={Plus} size={14} />Tambah baris</button>
      {error && <p className="crit-text" role="alert">Gagal membuat batch: {error}</p>}
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={onClose} disabled={saving}>Batal</button>
        <button type="submit" className="button primary" disabled={saving}>{saving ? "Menyimpan…" : "Simpan batch"}</button>
      </div>
    </form>}
  </Modal>;
}
