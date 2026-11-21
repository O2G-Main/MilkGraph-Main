"use client";

import { API_MODE, type ApiError } from "./client.ts";
import { useResource } from "./resource.ts";
import type { BeAssetVolume } from "./contract.ts";

/**
 * Saldo volume satu aset dari server (GET /trace/assets/{ref}/volume).
 * Saldo diturunkan server dari seluruh catatan transfer, jadi halaman tidak
 * menambah atau mengurangi angka lokal lagi. Di luar mode API hook ini diam.
 * Ref yang tidak dikenal server dibalas 404; pemanggil menampilkannya sebagai
 * saldo transfer 0 dengan keterangan, bukan diam-diam memakai angka lokal.
 */
export function useAssetVolume(ref: string) {
  const res = useResource<BeAssetVolume>(API_MODE && ref ? `/trace/assets/${encodeURIComponent(ref)}/volume` : null);
  const status = (res.error as ApiError | null)?.status;
  return { volume: res.data, error: res.error, notFound: status === 404, loading: res.loading && !res.data && !res.error };
}

/** Teks saldo transfer untuk keterangan di kartu tangki. */
export function balanceNote(volume: BeAssetVolume | null, notFound: boolean, loading: boolean): string {
  if (loading) return "Memuat saldo transfer dari server…";
  if (notFound) return "Alat tidak dikenal server, saldo transfer 0 L.";
  if (!volume) return "Saldo transfer belum termuat dari server.";
  const sign = volume.balance_l > 0 ? "+" : "";
  return `Saldo transfer server ${sign}${new Intl.NumberFormat("id-ID").format(Math.round(volume.balance_l))} L dari ${volume.jumlah_transfer} transfer.`;
}
