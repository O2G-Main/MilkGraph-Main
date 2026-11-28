"use client";

import { useRef, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Icon, Input, Modal } from "@/components/ui";
import { Select } from "@/components/ui/fields";
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
  const lock = useRef(false);
  const edited = useRef(false);
  const [lineKeys, setLineKeys] = useState([0]);
  const [lineSelections, setLineSelections] = useState<Record<number, { sku: string; filling: string; tank: string; sterilizer: string }>>({
    0: { sku: "", filling: "", tank: "", sterilizer: "" },
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadError = catalog.error ?? assets.error;
  const lineValue = (key: number) => lineSelections[key] ?? { sku: "", filling: "", tank: "", sterilizer: "" };
  const updateLine = (key: number, patch: Partial<{ sku: string; filling: string; tank: string; sterilizer: string }>) => {
    edited.current = true;
    setLineSelections(prev => ({ ...prev, [key]: { ...lineValue(key), ...patch } }));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    if (lineKeys.some(key => !value(`sku-${key}`) || !value(`filling-${key}`))) {
      setError("SKU jadi dan lini filling wajib dipilih pada setiap baris.");
      return;
    }
    const lines = lineKeys.map(key => {
      const order = value(`order-${key}`);
      const tank = value(`tank-${key}`), sterilizer = value(`sterilizer-${key}`), packCount = value(`packs-${key}`);
      return {
        ...(order && { production_order_id: order }),
        finished_sku_id: value(`sku-${key}`),
        filling_line_id: value(`filling-${key}`),
        target_volume_l: Number(value(`volume-${key}`)),
        ...(tank && { aseptic_tank_id: tank }),
        ...(sterilizer && { sterilizer_id: sterilizer }),
        ...(packCount && { target_packs: Number(packCount) }),
      };
    });
    lock.current = true;
    setSaving(true);
    setError(null);
    try {
      await apiSend("POST", "/production/batches", { production_date: date, lines }, role);
      invalidateResources(["/production/daily", "/production/schedule", "/production/plans"]);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch gagal dibuat.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  const close = () => {
    if (!lock.current && (!edited.current || window.confirm("Tutup dan batalkan perubahan batch?"))) onClose();
  };

  return <Modal title="Buat batch produksi" onClose={close}>
    <p className="small muted">Tanggal produksi {date} (WIB). Kode batch dibuat oleh backend.</p>
    {loadError ? <p className="crit-text" role="alert">Gagal memuat katalog: {loadError.message}</p>
    : !catalog.data || !assets.data ? <p className="muted" role="status">Memuat SKU dan lini…</p>
    : !skuOptions.length || !filling.length ? <p className="muted">Katalog SKU atau lini filling belum tersedia.</p>
    : <form className="schedule-form production-entry-form" onSubmit={submit} onChange={() => { edited.current = true; }}>
      {lineKeys.map((key, index) => {
        const current = lineValue(key);
        return <fieldset key={key} className="production-batch-line" disabled={saving}>
        <legend>Baris {index + 1}</legend>
        <div className="production-settings-grid">
          <label><span className="field-label">SKU jadi</span><Select name={`sku-${key}`} label={`SKU jadi baris ${index + 1}`} placeholder="Pilih SKU" required disabled={saving} value={current.sku} onChange={sku => updateLine(key, { sku })} options={skuOptions.map(sku => ({ value: sku.finished_sku_id, label: sku.finished_sku_id }))} /></label>
          <label><span className="field-label">Lini filling</span><Select name={`filling-${key}`} label={`Lini filling baris ${index + 1}`} placeholder="Pilih lini" required disabled={saving} value={current.filling} onChange={filling => updateLine(key, { filling })} options={filling.map(asset => ({ value: asset.asset_id, label: asset.asset_id }))} /></label>
          <label><span className="field-label">Tangki aseptik</span><Select name={`tank-${key}`} label={`Tangki aseptik baris ${index + 1}`} disabled={saving} value={current.tank} onChange={tank => updateLine(key, { tank })} options={[{ value: "", label: "Belum ditentukan" }, ...tanks.map(asset => ({ value: asset.asset_id, label: asset.asset_id }))]} /></label>
          <label><span className="field-label">Sterilizer</span><Select name={`sterilizer-${key}`} label={`Sterilizer baris ${index + 1}`} disabled={saving} value={current.sterilizer} onChange={sterilizer => updateLine(key, { sterilizer })} options={[{ value: "", label: "Belum ditentukan" }, ...sterilizers.map(asset => ({ value: asset.asset_id, label: asset.asset_id }))]} /></label>
          <label><span className="field-label">Target volume (L)</span><Input name={`volume-${key}`} type="number" inputMode="decimal" min={0.01} step="any" required /></label>
          <label><span className="field-label">PO terkait (opsional)</span><Input name={`order-${key}`} /></label>
          <label><span className="field-label">Target pak (opsional)</span><Input name={`packs-${key}`} type="number" inputMode="numeric" min={1} /></label>
        </div>
        {lineKeys.length > 1 && <Button variant="text" onClick={() => setLineKeys(keys => keys.filter(id => id !== key))}>
          <Icon icon={Trash2} size={14} />Hapus baris {index + 1}
        </Button>}
      </fieldset>;
      })}
      <Button variant="text" disabled={saving} onClick={() => {
        edited.current = true;
        const key = nextLine.current++;
        setLineKeys(keys => [...keys, key]);
      }}><Icon icon={Plus} size={14} />Tambah baris</Button>
      {error && <p className="crit-text" role="alert">Gagal membuat batch: {error}</p>}
      <div className="dialog-actions">
        <Button variant="secondary" onClick={close} disabled={saving}>Batal</Button>
        <Button type="submit" variant="primary" disabled={saving}>{saving ? "Menyimpan…" : "Simpan batch"}</Button>
      </div>
    </form>}
  </Modal>;
}
