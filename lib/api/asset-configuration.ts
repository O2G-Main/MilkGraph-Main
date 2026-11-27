import type { ProductionSession } from "./production.ts";
export type AssetParameter = { key: string; label: string; unit: string; min: number; max: number; step: number; nullable: boolean };
export type AssetConfiguration = { asset_id: string; asset_name: string; asset_type: string; version: number; updated_at: string | null; fields: AssetParameter[]; values: Record<string, number | null> };
export function configurationEditable(session: ProductionSession | null, role: string) { return session?.role === role && session.permissions.includes("constraint.edit"); }
export function configurationChanges(config: AssetConfiguration, draft: Record<string, string>) {
  const changes: Record<string, number | null> = {};
  for (const field of config.fields) {
    const raw = draft[field.key];
    if (raw === undefined) continue;
    const value = raw.trim() === "" ? null : Number(raw);
    if (value === null && !field.nullable) throw new Error(`${field.label} wajib diisi.`);
    if (value !== null && (!Number.isFinite(value) || value < field.min || value > field.max || Math.abs(value / field.step - Math.round(value / field.step)) > 0.00001)) throw new Error(`${field.label} tidak sesuai batas atau kelipatan dari backend.`);
    if (value !== config.values[field.key]) changes[field.key] = value;
  }
  return changes;
}
type Client = { get: <T>(path: string, role: string) => Promise<T>; send: <T>(method: "PATCH", path: string, body: unknown, role: string) => Promise<T> };
export function createConfigurationSaver(client: Client) {
  let busy = false;
  let pending: { path: string; role: string; config: AssetConfiguration; changes: Record<string, number | null> } | null = null;
  return {
    get pendingVerification() { return pending !== null; },
    async save(config: AssetConfiguration, draft: Record<string, string>, role: string) {
      if (busy) throw new Error("Penyimpanan masih berlangsung.");
      busy = true;
      try {
        if (!pending) {
          const changes = configurationChanges(config, draft);
          if (!Object.keys(changes).length) throw new Error("Belum ada parameter yang berubah.");
          const session = await client.get<ProductionSession>("/session", role);
          if (!configurationEditable(session, role)) throw new Error("Sesi backend tidak memiliki izin mengubah konfigurasi alat.");
          const path = `/production/assets/${encodeURIComponent(config.asset_id)}/configuration`;
          pending = { path, role, config, changes };
          try { await client.send("PATCH", path, { version: config.version, changes }, role); }
          catch (error) {
            const status = (error as { status?: number }).status;
            if (status && status >= 400 && status < 500) pending = null;
            throw error;
          }
        }
        const expected = pending;
        if (expected.config.asset_id !== config.asset_id || expected.role !== role) throw new Error("Selesaikan verifikasi alat sebelumnya.");
        const verified = await client.get<AssetConfiguration>(expected.path, role);
        if (verified.asset_id !== config.asset_id || verified.version <= expected.config.version || Object.entries(expected.changes).some(([key,value]) => verified.values[key] !== value)) throw new Error("Nilai yang dibaca kembali belum cocok. Periksa konfigurasi terbaru sebelum mencoba perubahan lain.");
        pending = null;
        return verified;
      } finally { busy = false; }
    },
  };
}
