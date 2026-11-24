"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAssetVolume } from "@/lib/api/asset-volume";
import { Card, SectionTitle } from "@/components/ui";

const number = (n: number) => new Intl.NumberFormat("id-ID").format(Math.round(n));
const signed = (n: number) => `${n > 0 ? "+" : ""}${number(n)} L`;

export interface TankRef { id: string; level: number; capacity: number }

/**
 * Volume tangki mode API: masuk, keluar, dan saldo diambil dari
 * GET /trace/assets/{ref}/volume yang diturunkan server dari seluruh catatan
 * transfer. Halaman ini tidak lagi menambah atau mengurangi level lokal.
 * Level snapshot adalah snapshot historis skenario November
 * (1 Nov 2026 pukul 06.00) dari GET /scenario/november/tanks dan
 * ditampilkan terpisah.
 */
export function TankVolumeApiCard({ tanks, alat }: { tanks: TankRef[]; alat?: string }) {
  return (
    <Card className="rules-card" data-tour="transfer-tank">
      <SectionTitle title="Volume tangki terkini" subtitle="Masuk, keluar, dan saldo dihitung server dari seluruh catatan transfer. Level snapshot adalah snapshot historis 1 Nov 2026 pukul 06.00 dan tidak diubah halaman ini." />
      <div className="table-wrap"><table className="schedule-table">
        <thead><tr><th>Tangki</th><th className="numeric">Snapshot skenario</th><th className="numeric">Masuk (server)</th><th className="numeric">Keluar (server)</th><th className="numeric">Saldo transfer (server)</th><th className="numeric">Jumlah transfer</th><th><span className="sr-only">Riwayat</span></th></tr></thead>
        <tbody>{tanks.map(t => <TankVolumeRow key={t.id} tank={t} alat={alat} />)}</tbody>
      </table></div>
      {!tanks.length && <p className="muted">Tidak ada tangki pada filter ini.</p>}
    </Card>
  );
}

function TankVolumeRow({ tank, alat }: { tank: TankRef; alat?: string }) {
  const { volume, notFound, loading } = useAssetVolume(tank.id);
  return <tr>
    <td><strong className="mono">{tank.id}</strong><span className="table-sub">Kapasitas {number(tank.capacity)} L</span></td>
    <td data-label="Snapshot skenario" className="numeric">{number(tank.level)} L</td>
    <td data-label="Masuk (server)" className="numeric">{volume ? number(volume.total_in_l) + " L" : loading ? "Memuat…" : "-"}</td>
    <td data-label="Keluar (server)" className="numeric">{volume ? number(volume.total_out_l) + " L" : loading ? "Memuat…" : "-"}</td>
    <td data-label="Saldo transfer (server)" className="numeric"><strong>{volume ? signed(volume.balance_l) : notFound ? "0 L" : "-"}</strong>{notFound && <span className="table-sub">Alat tidak dikenal server, saldo transfer 0</span>}</td>
    <td data-label="Jumlah transfer" className="numeric">{volume ? volume.jumlah_transfer : notFound ? 0 : "-"}</td>
    <td className="table-action">{alat !== tank.id && <Link className="text-link" href={`/transfer?alat=${tank.id}`}>Riwayat<ArrowRight size={14} aria-hidden /></Link>}</td>
  </tr>;
}
