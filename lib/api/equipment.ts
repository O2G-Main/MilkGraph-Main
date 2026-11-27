import type { ProductionAsset, ProductionList, ProductionSession } from "./production.ts";
import type { Asset } from "../assets.ts";

export type EquipmentMaster = { asset_id: string; [key: string]: string | number | null | undefined };
export const EQUIPMENT_PATH = "/production/assets";
export const MISSING_STATUS = "missing";

export function canRecordStatus(session: ProductionSession | null, role: string): boolean {
  return session?.role === role && session.permissions.includes("downtime.record");
}

export function filterEquipment(assets: ProductionAsset[], search: string, type: string, status: string) {
  const query = search.trim().toLowerCase();
  return assets.filter(asset => (!type || asset.asset_type === type)
    && (!status || (status === MISSING_STATUS ? !asset.current_status : asset.current_status === status))
    && `${asset.asset_id} ${asset.asset_name} ${asset.asset_type} ${asset.current_status ?? ""}`.toLowerCase().includes(query));
}

const SPEC_FIELDS = [
  ["capacity_l", "Kapasitas (L)"], ["input_flow_lph", "Aliran masuk (L/jam)"],
  ["output_flow_lph", "Aliran keluar (L/jam)"], ["process_speed_lph", "Kecepatan proses (L/jam)"],
  ["speed_packph", "Kecepatan kemasan (pak/jam)"], ["holding_time_limit_hours", "Batas simpan (jam)"],
  ["cip_duration_minutes", "Durasi CIP (menit)"], ["compatible_product_family", "Keluarga produk kompatibel"],
];

export function equipmentSpecs(id: string, master: EquipmentMaster[]) {
  const row = master.find(asset => asset.asset_id === id);
  if (!row) return null;
  return SPEC_FIELDS.map(([key, label]) => ({ key, label,
    value: row[key] === null || row[key] === undefined || row[key] === "" ? "Belum tersedia" : String(row[key]),
  }));
}

export function toDowntimeMachines(assets: ProductionAsset[]): (Pick<Asset, "id"> & Partial<Pick<Asset, "status">>)[] {
  return assets.map(asset => ({ id: asset.asset_id, ...(asset.current_status ? { status: asset.current_status } : {}) }));
}

type StatusPayload = { status: string; status_reason?: string; source: "manual" };
type StatusClient = {
  get: <T>(path: string, role: string) => Promise<T>;
  send: (method: "POST", path: string, body: StatusPayload, role: string) => Promise<unknown>;
};

export function createStatusRecorder(client: StatusClient) {
  let busy = false;
  let pending: { id: string; role: string; body: StatusPayload } | null = null;
  return {
    get pendingVerification() { return pending !== null; },
    async save(id: string, status: string, reason: string, role: string): Promise<ProductionAsset> {
      if (busy) throw new Error("Penyimpanan masih berlangsung.");
      status = status.trim();
      reason = reason.trim();
      if (!status || /[\u0000-\u001f\u007f]/.test(status)) throw new Error("Masukkan status yang valid tanpa karakter kontrol.");
      if (pending && (pending.id !== id || pending.role !== role)) throw new Error("Selesaikan verifikasi status sebelumnya.");
      busy = true;
      try {
        if (!pending) {
          const session = await client.get<ProductionSession>("/session", role);
          if (!canRecordStatus(session, role)) throw new Error("Sesi backend tidak memiliki izin mencatat status.");
          const body: StatusPayload = { status, ...(reason ? { status_reason: reason } : {}), source: "manual" };
          await client.send("POST", `${EQUIPMENT_PATH}/${encodeURIComponent(id)}/status`, body, role);
          pending = { id, role, body };
        }
        const result = await client.get<ProductionList<ProductionAsset>>(`${EQUIPMENT_PATH}?include_pipes=true&search=${encodeURIComponent(id)}`, role);
        const row = result.items.find(asset => asset.asset_id === id);
        if (!row || row.current_status !== pending.body.status
          || (pending.body.status_reason && row.current_status_reason !== pending.body.status_reason)) {
          throw new Error("Verifikasi belum cocok dengan status yang dikirim. Periksa ulang tanpa mengirim status lagi.");
        }
        pending = null;
        return row;
      } catch (error) {
        if (pending) throw new Error(`Status sudah dikirim, tetapi belum terverifikasi. ${error instanceof Error ? error.message : "Gagal membaca status."}`);
        throw error;
      } finally {
        busy = false;
      }
    },
  };
}
